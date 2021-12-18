# Set Security Group name
SECURITY_GROUP_ID="SECURITY_GROUP_ID"

# Retrieve current IP address
PUBLIC_IP=`dig +short myip.opendns.com @resolver4.opendns.com`

# Remove all ingress rules
aws ec2 revoke-security-group-ingress --group-id $SECURITY_GROUP_ID \
  --ip-permissions \
  "`aws ec2 describe-security-groups --output json --group-ids $SECURITY_GROUP_ID --query "SecurityGroups[0].IpPermissions"`"

# Authorize access on ports 22 (SSH) and 3389 (RDP)
aws ec2 authorize-security-group-ingress --group-id "$SECURITY_GROUP_ID" --protocol tcp --port 22 --cidr "$PUBLIC_IP/32"
aws ec2 authorize-security-group-ingress --group-id "$SECURITY_GROUP_ID" --protocol tcp --port 3389 --cidr "$PUBLIC_IP/32"
