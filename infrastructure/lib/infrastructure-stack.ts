import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { readFileSync } from "fs";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

const userDataScript = readFileSync("./lib/user-data.sh", "utf8");

export class InfrastructureStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Backup bucket
    const backupBucket = new s3.Bucket(this, "BackupBucket", {
      bucketName: "backup.christiandbf.com",
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Personal website
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
      defaultRootObject: "index.html",
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

    // Network
    const vpc = ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: process.env.VPC_ID!,
    });

    const webExternalSecurityGroup = new ec2.SecurityGroup(
      this,
      "WebExternalAccessSecurityGroup",
      {
        vpc,
        description: "Allow external web access",
        securityGroupName: "WebExternalAccess",
        allowAllOutbound: true,
      }
    );

    webExternalSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "allow http access from the world"
    );

    webExternalSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(80),
      "allow http access from the world"
    );

    webExternalSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "allow https access from the world"
    );

    webExternalSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(443),
      "allow https access from the world"
    );

    const vpnSecurityGroup = new ec2.SecurityGroup(
      this,
      "VpnAccessSecurityGroup",
      {
        vpc,
        description: "Allow VPN access",
        securityGroupName: "VpnAccess",
        allowAllOutbound: true,
      }
    );

    vpnSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(51820),
      "allow wireguard access from the world"
    );

    vpnSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.udp(51820),
      "allow wireguard access from the world"
    );

    vpnSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(1194),
      "allow openvpn access from the world"
    );

    vpnSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.udp(1194),
      "allow openvpn access from the world"
    );

    const sshSecurityGroup = new ec2.SecurityGroup(
      this,
      "SshAccessSecurityGroup",
      {
        vpc,
        description: "Allow SSH access",
        securityGroupName: "SshAccess",
        allowAllOutbound: true,
      }
    );

    // Computing
    const machineImage = ec2.MachineImage.fromSsmParameter(
      "/aws/service/canonical/ubuntu/server/focal/stable/current/amd64/hvm/ebs-gp2/ami-id",
      { os: ec2.OperatingSystemType.LINUX }
    );

    const servicesEc2Role = new Role(this, "ServicesEc2Role", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
    });
    servicesEc2Role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );
    servicesEc2Role.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess")
    );
    backupBucket.grantReadWrite(servicesEc2Role);

    const servicesEc2ElasticIp = new ec2.CfnEIP(this, "ServicesEc2ElasticIp");
    const servicesEc2 = new ec2.Instance(this, "ServicesEc2", {
      machineImage,
      vpc,
      role: servicesEc2Role,
      instanceType: new ec2.InstanceType("t3a.micro"),
      userData: ec2.UserData.custom(userDataScript),
      securityGroup: webExternalSecurityGroup,
      keyName: "services-ec2",
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(8),
        },
      ],
    });

    new ec2.CfnEIPAssociation(this, "ServicesEc2ElasticIpAssociation", {
      eip: servicesEc2ElasticIp.ref,
      instanceId: servicesEc2.instanceId,
    });

    servicesEc2.addSecurityGroup(vpnSecurityGroup);

    new route53.ARecord(this, "ServicesEc2ARecord", {
      zone,
      recordName: "services.christiandbf.com",
      target: route53.RecordTarget.fromIpAddresses(servicesEc2ElasticIp.ref),
    });

    new route53.ARecord(this, "ReignEc2ARecord", {
      zone,
      recordName: "reign.christiandbf.com",
      target: route53.RecordTarget.fromIpAddresses(servicesEc2ElasticIp.ref),
    });

    new route53.ARecord(this, "ApiReignEc2ARecord", {
      zone,
      recordName: "api.reign.christiandbf.com",
      target: route53.RecordTarget.fromIpAddresses(servicesEc2ElasticIp.ref),
    });
  }
}
