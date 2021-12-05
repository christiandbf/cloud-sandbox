import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";

export class WebsiteStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new s3.Bucket(this, "BackupBucket", {
      bucketName: "backup.christiandbf.com",
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const myWebsiteBucket = new s3.Bucket(this, "MyWebsiteBucket", {
      bucketName: "christiandbf.com",
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "MyWebsiteCertificate",
      `arn:aws:acm:${Stack.of(this).region}:${
        Stack.of(this).account
      }:certificate/${process.env.CERTIFICATE_ID}`
    );

    const cf = new cloudfront.Distribution(this, "MyWebsiteDistribution", {
      defaultBehavior: { origin: new origins.S3Origin(myWebsiteBucket) },
      defaultRootObject: 'index.html',
      domainNames: ["christiandbf.com"],
      certificate,
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "MyWebsiteHostedZone",
      {
        zoneName: "christiandbf.com",
        hostedZoneId: process.env.HOSTED_ZONE_ID!,
      }
    );

    new route53.ARecord(this, "CDNARecord", {
      zone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cf)),
    });

    new route53.AaaaRecord(this, "AliasRecord", {
      zone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cf)),
    });
  }
}
