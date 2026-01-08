# AutoForecast Platform

A self-service AI-powered time series forecasting platform that automates the entire forecasting pipeline — from data profiling to model selection, training, and evaluation.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  React 19   │────▶│  Hono API    │────▶│  SageMaker      │
│  Cloudscape │     │  (Lambda)    │     │  Processing     │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │                      │
                    ┌──────▼───────┐       ┌──────▼──────┐
                    │  Bedrock     │       │  AutoGluon  │
                    │  Claude Opus │       │  + Chronos  │
                    └──────────────┘       └─────────────┘
```

## Features

- **AI-Driven Analysis** — Claude Opus 4.6 analyzes your data and formulates a forecasting hypothesis
- **Automated Code Generation** — LLM generates custom AutoGluon training code based on data characteristics
- **Iterative Validation** — Automatic validation loop with up to 3 fix attempts before full training
- **Plan-Driven Model Selection** — Models chosen by AI analysis, not hardcoded lists
- **Real-Time Progress Tracking** — 4-step pipeline with elapsed time and status updates
- **Interactive Results** — Backtest metrics (WAPE), HTML plots, downloadable forecasts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Cloudscape Design System, Vite |
| API | Hono (TypeScript), esbuild (36KB bundle) |
| AI | Amazon Bedrock (Claude Opus 4.6) |
| ML | AutoGluon 1.4 (CPU), Chronos zero-shot |
| Compute | AWS Lambda (async self-invoke, 15min), SageMaker Processing |
| Storage | DynamoDB, S3 |
| Infra | CDK, CloudFront, WAF (corp IP restriction) |

## Pipeline Steps

1. **Upload** — CSV time series data (up to 1GB)
2. **Analysis** — AI profiles data, identifies patterns, formulates hypothesis
3. **Code Generation** — Custom AutoGluon script generated based on analysis
4. **Validation** — Quick test job (ml.t3.medium) to verify code correctness
5. **Full Training** — Complete model training with all data
6. **Results** — WAPE metrics, forecast plots, downloadable predictions

## Project Structure

```
packages/
├── api/          # Hono API (Lambda)
│   └── src/
│       ├── services/   # Bedrock, SageMaker, DynamoDB, S3, code-gen
│       ├── routes/     # Upload, profiler, forecast, results, session
│       └── models/     # TypeScript types
├── web/          # React frontend
│   └── src/
│       ├── pages/      # Home, Upload, Analysis, Running, Results
│       └── hooks/      # SSE chat, session management
└── cdk/          # Infrastructure as Code
    └── lib/stacks/     # CloudFront, Lambda, DynamoDB, S3, WAF
```

## Development

```bash
# Install dependencies
npm install

# Run API locally
cd packages/api && npm run dev

# Run frontend locally
cd packages/web && npm run dev

# Deploy
cd packages/cdk && npx cdk deploy
```

## Security

- WAF WebACL with corp IP restriction (default BLOCK)
- API Gateway resource policy (CloudFront-only access)
- No direct API access — all traffic through CloudFront

## License

MIT
