#!/usr/bin/env node
import "dotenv/config";
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WebsiteStack } from '../lib/website-stack';

const app = new cdk.App();

new WebsiteStack(app, 'InfrastructureStack', {
  env: { account: process.env.ACCOUNT, region: process.env.REGION },
});