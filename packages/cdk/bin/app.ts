#!/usr/bin/env npx ts-node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AppStack } from "../lib/stacks/app-stack";

const app = new cdk.App();

const env = {
  account: "762233765864",
  region: "us-east-1",
};

new AppStack(app, "F3ExcelsiorForecastLauncher-Alpha", { env });
