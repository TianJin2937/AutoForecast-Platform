import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import * as path from "path";

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Data Layer ---
    const dataBucket = new s3.Bucket(this, "DataBucket", {
      bucketName: `autoforecast-data-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ["https://d1hrsx6j3a7a3k.cloudfront.net"],
          allowedHeaders: ["*"],
        },
      ],
    });

    const sessionsTable = new dynamodb.Table(this, "SessionsTable", {
      tableName: "AutoForecastSessions",
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    sessionsTable.addGlobalSecondaryIndex({
      indexName: "userId-index",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });

    // --- SageMaker Execution Role ---
    const sagemakerRole = new iam.Role(this, "SageMakerRole", {
      assumedBy: new iam.ServicePrincipal("sagemaker.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSageMakerFullAccess"),
      ],
    });
    dataBucket.grantReadWrite(sagemakerRole);

    // --- API Lambda ---
    const apiFunction = new lambda.Function(this, "ApiFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../../api/dist")),
      memorySize: 512,
      timeout: cdk.Duration.minutes(15),
      environment: {
        SESSIONS_TABLE: sessionsTable.tableName,
        DATA_BUCKET: dataBucket.bucketName,
        SAGEMAKER_ROLE_ARN: sagemakerRole.roleArn,
        PROFILER_MODEL: "us.anthropic.claude-opus-4-6-v1",
        CODEGEN_MODEL: "us.anthropic.claude-opus-4-6-v1",
      },
    });
    sessionsTable.grantReadWriteData(apiFunction);
    dataBucket.grantReadWrite(apiFunction);
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: ["*"],
      })
    );
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["sagemaker:CreateProcessingJob", "sagemaker:DescribeProcessingJob"],
        resources: ["*"],
      })
    );
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["logs:FilterLogEvents", "logs:DescribeLogStreams", "logs:GetLogEvents"],
        resources: ["*"],
      })
    );
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [sagemakerRole.roleArn],
      })
    );
    // Allow Lambda to invoke itself asynchronously for forecast pipeline
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [`arn:aws:lambda:${this.region}:${this.account}:function:*`],
      })
    );

    // --- Scheduled recovery for stuck sessions (every 5 min) ---
    const rule = new cdk.aws_events.Rule(this, "RecoverySchedule", {
      schedule: cdk.aws_events.Schedule.rate(cdk.Duration.minutes(5)),
    });
    rule.addTarget(new cdk.aws_events_targets.LambdaFunction(apiFunction));

    // --- API Gateway (CloudFront-only access via origin header verification) ---
    const CF_ORIGIN_SECRET = "b36846a84912efff085b03d55f991548aefd03540cb71d3a0644732f3159ac6c";

    const apiGw = new apigateway.LambdaRestApi(this, "ApiGateway", {
      handler: apiFunction,
      proxy: true,
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.AnyPrincipal()],
            actions: ["execute-api:Invoke"],
            resources: ["execute-api:/*"],
            conditions: {
              StringEquals: { "aws:Referer": CF_ORIGIN_SECRET },
            },
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal()],
            actions: ["execute-api:Invoke"],
            resources: ["execute-api:/*"],
            conditions: {
              StringNotEquals: { "aws:Referer": CF_ORIGIN_SECRET },
            },
          }),
        ],
      }),
    });

    // --- Static Website Hosting ---
    const webBucket = new s3.Bucket(this, "WebBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      webAclId: "arn:aws:wafv2:us-east-1:762233765864:global/webacl/autoforecast-corp-only/71bdfb70-1c60-4616-85e2-a3f5642805c9",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.RestApiOrigin(apiGw, {
            customHeaders: { Referer: CF_ORIGIN_SECRET },
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: "index.html",
      errorResponses: [
        { httpStatus: 403, responsePagePath: "/index.html", responseHttpStatus: 200 },
      ],
    });

    new s3deploy.BucketDeployment(this, "WebDeploy", {
      sources: [s3deploy.Source.asset(path.join(__dirname, "../../../../build/web-dist"))],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, "DashboardUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "AutoForecast Dashboard URL",
    });
    new cdk.CfnOutput(this, "ApiUrl", {
      value: apiGw.url,
      description: "API Gateway URL",
    });
    new cdk.CfnOutput(this, "DataBucketName", {
      value: dataBucket.bucketName,
    });
  }
}
