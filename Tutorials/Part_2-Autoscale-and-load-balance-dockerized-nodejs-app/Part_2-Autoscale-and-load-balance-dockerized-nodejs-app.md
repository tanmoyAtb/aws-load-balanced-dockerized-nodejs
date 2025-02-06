# Part 2 - Autoscale and load balance dockerized nodejs app

## Create a base image (AMI) for our ec2 instances.

In this section we will create a base image or AWS Machine image (AMI). This AMI will be later used automatically spin up ec2 instances for our application.

Prerequisites:

1. You should have a security group with SSH, HTTP and HTTPS access (Although these access will not be required later)
2. Create a ec2 role with SSM and ECR access. (Refer to Part 1). This role is called `ec2-my-app-role` (for example)

Now, Go to AWS ec2 panel, And hit "Launch instance"

Go through with the following instructions to create the instance:

- name: my-app-ec2-base-instance (or any name you like)
- Machine image: Ubuntu (choose the latest version)
- Instance type: t3a.micro (or any instance you prefer)
- Key pair: Make sure to attach a key pair (create a new key if needed)
- Security group: Select existing or create a security group. Make sure allow SSH, HTTP and HTTPS traffic is ticked.
- Add storage: 12GB is good enough
- Open **Advanced details**, from "IAM instance profile", select the role we created in previous section `ec2-my-app-role`

That's it, not hit "Launch instance"
Now go to the ec2 panel and you should see the instance loading up. When instance is in `running` state, click on it and then on next page,
Click on "Connect". We will connect to our ec2 instance using ssh to configure and run it.

[Connect ec2 instance][Connect_ec2_instance.png]

You should see a terminal to configure your ec2 now.

**Configuring the ec2**

The following steps are very similar to what we did before in part 1, except we will also add code deploy agent.
Go through the following instructions to configure the ec2. This will install necessary dependencies, nginx, install docker, aws cli and aws code deploy agent.

1. Install necessary dependencies

First install some necessary updates and dependencies for the next steps.

```bash
# Update package list and upgrade all packages
sudo apt-get update -y
sudo apt-get upgrade -y

# Necessary packages
sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common
```

We will also install nginx and git in the instance

```bash
sudo apt-get install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

sudo apt-get install -y git
```

2. We install docker in the ec2 instance

We also install docker compose and configure user permissions for docker

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" -y

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io -y

# enable, start docker
sudo systemctl start docker
sudo systemctl enable docker

sudo docker --version

# Docker user group
sudo usermod -aG docker $USER
newgrp docker

# Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.22.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# optional - clean all docker unused images, containers
docker system prune -a --force
```

3. Next, we will install AWS cli into the instance.
   We will need the aws cli to pull docker image from ECR and to configure env variables in next part.

```bash
sudo apt-get update -y
sudo apt-get install -y unzip curl

curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws --version
```

4. Install Aws code deploy agent. The code deploy agent will be needed in the next part (part 3) for continuous deployment. You may skip if you do not need continuous deployment pipeline.

```bash
sudo apt-get update -y
sudo apt-get install -y ruby-full
wget https://aws-codedeploy-us-east-1.s3.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto

# check
sudo service codedeploy-agent status
```

Now that all the base requirements are met for the image, we will create an AMI now.
Close the ssh connection tab and go to the ec2 panel. Select the ec2 instance which was just configured.
From "actions" -> "image and templates" -> "Create image", click here.
Provide a name
This will create an image from the instance, which can be used for any application using docker.

[Create ec2 ami image dropdown](Create_ec2_ami_image_dropdown)
[Create ec2 ami image](Create_ec2_ami_image)

It will take some time for the AMI to be ready.

## Create an ec2 launch template

Now that our ec2 image is ready, we will now create an ec2 launch template. A launch template is a set of configuration that can be used to launch an ec2 instance.

Go to "Ec2 panel" and select "Launch template" from side panel.

Now click on "Create launch template"
We will now go through a series of instructions to create the launch template.

1. Provide a name for the launch template, for example `my-app-launch-template`
2. Make sure to tick the "Provide guidance to help me set up a template that I can use with EC2 Auto Scaling" under "Auto scaling guidance". As we will use the launch template with auto scaling group later.
3. Under "Application and OS images", click on "My AMIs", and select the AMI you created in previous section, i.e. `docker-app-base-ami`
4. Under instance type, select `t3a.micro` (or any other instance)
5. Select an existing key pair
6. Under network settings, select a security group with SSH (You may add HTTP and HTTPS access if you would like to test the ec2 access later).
7. Add minimum 12GB of storage
8. Under "Advanced details", under "IAM instance profile", select `ec2-my-app-role` (with ECR and SSM access)
9. **User data**. This is one of the most important section of the launch template.

The "User data" is a bash script which is run after the ec2 instance is up and running for the FIRST time. In the section you will add commands to pull your ECR image, setup environment and run the application.

With this setup, we can have a generic ami image and then we can use "User data" to spin up instances for different types of applications.

Paste the following bash script under "User data".
Instructions for base script.

Fill in initial variables

- `APP_NAME`: This is the app name, which was used in docker repo, i. e. "my-app"
- `PORT`: The port which is used by your application, i.e 8000
- `AWS_ACCOUNT_ID`: The account ID needed for docker repo
- `AWS_REGION`: The account region needed for docker repo
- `IMAGE_TAG`: THe docker image tag, i.e latest

**Note**: Make sure to use quotation ("") in the variable values

Explanation of the user data:

- We login to ECR
- We pull the application image
- We setup .env file from SSM
- We run the application using docker
- We add nginx configuration and run it.

```bash
#!/bin/bash

# ---- DOCKER PULL and RUN
# VARS
APP_NAME="my-app"
PORT="8000"

AWS_ACCOUNT_ID="<aws_account_id>"
AWS_REGION="<aws_region>"
IMAGE_TAG="latest"

# Go to HOME
cd /home/ubuntu

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker pull $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$APP_NAME:$IMAGE_TAG

# Load .env from ssm
aws ssm get-parameters-by-path \
    --path "/${APP_NAME}" --recursive --with-decrypt \
    | jq -r '.Parameters[] | (.Name | split("/")[-1]) + "=" + (.Value)' \
    | tee .env

docker run --env-file .env -p 8000:8000 -d $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/my-app:latest

# nginx setup
echo "server {
listen 80;
server_name _;
client_max_body_size 20M;

location / {
proxy_pass http://localhost:${PORT};
proxy_http_version 1.1;
proxy_set_header Upgrade \$http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host \$host;
proxy_cache_bypass \$http_upgrade;
}
}" | sudo tee /etc/nginx/sites-available/default > /dev/null

sudo nginx -t
sudo service nginx restart
```

Now all the launch template configuration is ready. Hit "Create launch template".

**Note**: To test the launch template from ec2 Launch templates panel, Select the Launch template `my-app-launch-template`, from "Actions" dropdown, click "Launch instance from template". With the configuration, click "Launch template". You will have an instance running your application.

## Create Load balancer with auto scaling

In this section, we will create a load balancer with auto scaling group.
The load balancer with take requests and route them to proper instances.
We will use target groups to register and manage instances.
Finally, we will use an auto scaling group to control how many instances of the application we will use.

First, we will create a security group for our load balancer.

From the "Ec2 panel", go to "security groups" and click on "Create security group"

Follow these instructions

1. Use a name like "my-app-lb-sg"
2. Add a description like "My app load balancer"
3. Under inbound rules, use "HTTP", source "Custom" with "0.0.0.0/0" (Allow from anywhere)
4. Under outbound rules, make sure "All traffic" from anywhere is added.

Create the security group.

[Create load balancer security group](Create_load_balancer_security_group.png)

### Create target group

Now we will create a target group that will be attached to load balancer later.
In EC2 panel, go to "Target groups" under "Load balancing", click on "Click target group"

Follow these instructions

1. Under target type, select "Instances"
2. Add a target group name "my-app-tg"
3. Make sure Protocol "HTTP" and port "80" are selected
4. Keep IP address, VPC and protocol, and Health checks as is default
5. click "next"
6. In next page directly click "Create target group"

[Create target group 1](Create_target_group_1.png)
[Create target group 2](Create_target_group_1.png)
[Create target group 3](Create)

### Create load balancer

Now we will create a load balancer.
From "EC2 panel", go to "Load balancers", click "Create load balancer"

Follow these instructions:

1. Under "Application load balancer", click "create"
2. Add a load balancer name "my-app-lb"
3. Keep scheme "internet facing"
4. Under network mapping, keep "default vpc", under availability zones, make sure you have at least 2 zone chosen
5. Under "security group", choose the security group we created earlier "my-app-lb-sg"
6. Under listeners and routing, One listener should be added. Protocol "HTTP", port "80", default action should be forwarded to the target group we created "my-app-tg"
7. Now click "Create load balancer"

[Create load balancer 1](Create_load_balancer_1.png)
[Create load balancer 2](Create_load_balancer_2.png)
[Create load balancer 3](Create_load_balancer_3.png)
[Create load balancer 4](Create_load_balancer_4.png)

Now our load balancer should be created. You should see a "DNS name" under load balancer details.
It should have a format like this

`my-app-lb-156356388.<aws_region>.elb.amazonaws.com`

[Load balancer details](Load_balancer_details.png)

This is the URL our application will get deployed in ultimately. If you visit this URL now, you will see `503` because there are no instances of our application running under the target group. This is where we need an "Auto scaling group"

### Create Auto scaling group

Under "EC2 panel", under "Auto scaling", go to "Auto scaling groups".
Click on "Create auto scaling group"

Follow these instructions:

1. Step 1: Add a name "my-app-asg"
2. Select the launch template we created earlier "my-app-launch-template"
3. Step 2: Instance requirements: keep as is
4. Under network, select at lease, keep VPC, and select at least one availability zone
5. Step 3: Select "Attach to existing load balancer"
6. Under target groups, select our target group "my-app-tg"
7. Keep rest of the settings as is
8. Step 4: Select value "1" for desired, minimum and maximum group size, this will make sure at least instance of our app is running
9. keep rest of settings as is
10. Step 5 notifications, step 6 tags: keep as is
11. Step 6: Review everything and click "Create auto scaling group"

[Create auto scaling group step 1](Create_auto_scaling_group_step_1.png)
[Create auto scaling group step 2](Create_auto_scaling_group_step_2.png)
[Create auto scaling group step 3](Create_auto_scaling_group_step_3.png)
[Create auto scaling group step 4](Create_auto_scaling_group_step_4.png)

Now if you wait some time, in your EC2 instances list, you should see a new instances automatically spinning up.
This is an instance of our application.

**Note**: If you terminate this instance, a new instance will spin up automatically.

Now if you visit the load balancer DNS `my-app-lb-156356388.<aws_region>.elb.amazonaws.com`,
You should see "Hello from my-app!"

Congratulations, our load balanced auto scaled application is running.
