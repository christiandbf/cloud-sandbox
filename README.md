# Cloud Sandbox

Cloud resources used for development and personal services.

## Architecture

![Architecture](/docs/architecture.png)

## Considerations

* Create separate security groups by purpose, for example: security group for SSH, security group for external WEB.
* Content on S3 should not be public, expose files using a policy to allow read from cloud front.
