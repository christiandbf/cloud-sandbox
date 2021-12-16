#!/usr/bin/env node
import "dotenv/config";
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';

const app = new cdk.App();

new InfrastructureStack(app, 'InfrastructureStack', {
  env: { account: process.env.ACCOUNT, region: process.env.REGION },
});