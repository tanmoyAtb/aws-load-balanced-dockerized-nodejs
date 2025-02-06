# Part 1 - Dockerize and deploy Nodejs with AWS ECR and EC2

## Setup your sample application

We assume you your app all setup. In this example we will setup a nodejs app.

Lets setup our server app first. Create a folder, for example with name `my-app`, move into the folder `cd my-app` and Run

```bash
npm init -y
```

You should now have a bare bone nodejs server.
Lets, install express and dotenv for a simple app

```bash
npm i express dotenv
```

create an `index.js` file and add this code. It creates a server using express. Note that code use _Port 8000_

```javascript
const express = require("express");
require("dotenv").config();

const PORT = 8000;
const APP_NAME = process.env.APP_NAME;

const app = express();

app.get("/", (_, res) => {
  res.send(`Hello from ${APP_NAME}!`);
});

app.listen(PORT, () => {
  console.log(`Hello from ${APP_NAME}!`);
});
```

The code reads `APP_NAME` from a `.env` file. This is mainly to demonstrate how environments can be managed in aws. create a `.env` file and add the following env variables, Use any values you would like

```bash
APP_NAME=myapp
```

In `package.json`, add the `start` command under `scripts`

```javascript
"scripts": {
  "start": "node index.js"
}
```

Now run `npm install` and then `npm start` to run the server. You should see **Hello from myapp!** when the server starts.

## Dockerize the application

We will dockerize our nodejs application in this section. First make sure Docker is installed in your system. Check the [Official Documentation](https://docs.docker.com/engine/install/) to install.

Make sure to install buildx and support multi architecture builds.

The first step to dockerize your app is to write a `Dockerfile`. For our nodejs app, create a file named `Dockerfile` and add the following code.

```bash
# Use the official Node.js 20.13.1 image
FROM node:20.13.1-alpine

# Set the working directory
WORKDIR /app

# Copy the project
COPY . ./

# Install dependencies
RUN npm install

# Expose the port (replace with your application's port)
EXPOSE 8000

# Command to start the application
CMD ["npm", "start"]
```

Also create a `.dockerignore` file to ignore specific files from getting copied to docker image.

```bash
node_modules
.env
```

**Note:** we will not pass the .env file when building docker image. In AWS, env vars will be made available in a more secure and scalable way.

Now run the following code to build an image of your application. You can use any name other than `my-app`

```bash
docker build -t my-app:latest .
```

Now your docker image is ready. To check docker images you can run `docker images`. You should see `my-app` in the list.

To run the docker image in a container locally, use the following command. Make sure you are in the Folder with `.env` file. Use the appropriate port mapping

```bash
docker run --env-file .env -p 8000:8000 my-app:latest
```

This should run your dockerized application now. Visit `https://localhost:8000` to check.

## Deploy Dockerized app in AWS EC2

### Create an ERC repository for our app

Now that our docker image is ready and we have tested that it works, we will now host the image in AWS ECR. AWS ECR or Elastic container service is a service where you can host docker images.

First thing first, we first have to login to AWS from browser and on our cli.
You can follow along the AWS cli installation instructions [HERE](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
Next, Login to to be authenticated with AWS CLI following instructions [HERE](https://docs.aws.amazon.com/signin/latest/userguide/command-line-sign-in.html)

Now, Login to AWS console from the Browser and search for ECR.

From the ECR console, click on "Create Repository". Fill in the name as "my-app", or your desired name.

[Create repository image](Create_Repository.png)

On the ECR console, you should see the "Repository URI" with the following structure. We will need this "Repository URI" later.

`<aws_account_id>.dkr.ecr.<aws_region>.amazonaws.com/my-app`
(or, the repository name you use)

### Push image to ECR

To push our image to ECR we will use the AWS CLI.

First login to ECR using CLI. Make sure to replace `<aws_account_id>`, `<aws_region>`

```bash
aws ecr get-login-password --region <aws_region> | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.<aws_region>.amazonaws.com
```

You should see `Login Succeeded` in the console.
Now we will push the `my-app` docker image to ECR.

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <aws_account_id>.<aws_region>.amazonaws.com/my-app:latest --push .
```

This will push our image to ECR. If you visit ECR and click on `my-app` repository. You should see the `latest` tagged image.

**Notes**: We are building the image for multiple platforms as our production instance can have any platform. You may skip multiple architecture build if you know the architecture of your production servers.
Make sure buildx is installed with docker locally.

## Running application in EC2

There are a number of steps to run our application properly. THe steps are

- Configure env using parameter store
- COnfigure ec2 role so our ec2 has proper permissions
- Run application in ec2

### configuring aws parameter store for env variables

To securely use environment variables with aws services, we will use AWS parameter store (a feature of aws Systems Manager or SSM).
parameter store is a service where you can store secrets or variables and then read from different services.

Search for "Parameter store" in aws and go into it. Click "Create parameter".

Use `/my-app/APP_NAME` as the name and use `my-app` as value. You can even use encrypted values if your secrets are sensitive.

[Create parameter](Create_parameter.png)

Now click "Create parameter" and we are done

### Create aws ec2 role for configuring permissions

In this section we will create an aws ec2 role which will be used with the AWS instance.

Search for "IAM" in the AWS panel and go into. Select "Roles" from the left panel under "Access management".
Click on "Create role".

step 1. Under "Select trusted entity", select "AWS service", under "Use case", select "EC2". Click next.

[Create ec2 role - Trusted entity](Create_ec2_role_step_1_trusted_entity.png)

step 2. Next we "Add permissions". Add the following permission sets by searching

- `AmazonSSMReadOnlyAccess`
- `AmazonEC2ContainerRegistryPullOnly`

Now, click next

step 3. Provide name and check access and create the role.

Provide a name for the role like `ec2-my-app-role`, check permissions and create the role.

[Create ec2 role - Create role](Create_ec2_role_step_3_create_role)

### Run application on EC2

Now it is time to create our ec2 and run our application. Go to "EC2" panel in aws and click `Launch instance`

Choose the follow config when creating the ec2

- name: my-app-ec2 (or any name you like)
- Machine image: Ubuntu (choose the latest version)
- Instance type: t3a.micro (or any instance you prefer)
- Key pair: Make sure to attach a key pair (create a new key if needed)
- Security group: Select existing or create a security group.
  Make sure allow SSH, HTTP and HTTPS traffic is ticked.
- Add storage: 12GB is good enough
- Open **Advanced details**, from "IAM instance profile", select the role we created in previous section `ec2-my-app-role`

That's it, not hit "Launch instance"
Now go to the ec2 panel and you should see the instance loading up. When instance is in `running` state, click on it and then on next page,
Click on "Connect". We will connect to our ec2 instance using ssh to configure and run it.

[Connect ec2 instance][Connect_ec2_instance.png]

You should see a terminal to configure your ec2 now.

**Configuring the ec2**

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

**Running the application**

Our first task is to pull the ECR image into our ec2 instance.

Make sure to replace `<aws_region>`, `<aws_account_id>` and use your docker image name and tags (i.e `my-app`, `latest`).

```bash
aws ecr get-login-password --region <aws_region> | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.<aws_region>.amazonaws.com
docker pull <aws_account_id>.dkr.ecr.<aws_region>.amazonaws.com/my-app:latest
```

docker pull 824039889403.dkr.ecr.ap-south-1.amazonaws.com/my-app:latest

Now if you run `docker images`, you should you `.../my-app` image with `latest` tag.

Next we read env vars from AWS SSM parameter store and create a `.env` file.

```bash
aws ssm get-parameters-by-path \
    --path "/my-app" --recursive --with-decrypt \
    | jq -r '.Parameters[] | (.Name | split("/")[-1]) + "=" + (.Value)' \
    | tee .env
```

What it does is it recursively reads all parameter store parameters that start with `/my-app`, this is why used a suffix in the name.
if your run `cat .env`, you should see contents of `.env` file just created.

Finally we are ready to run our application. We use

```bash
docker run --env-file .env -p 8000:8000 -d <aws_account_id>.dkr.ecr.<aws_region>.amazonaws.com/my-app:latest
```

You can run `curl http://localhost:8000` to check application is running.

**Accessing our application**

Configure nginx to serve our application in the default Http port accessible from the internet.
The configuration tells nginx to forward requests to port 8000

```bash
echo "server {
listen 80;
server_name _;
client_max_body_size 20M;

location / {
proxy_pass http://localhost:8000;
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

Now run `curl http://localhost` and you see your application output.

To access to our application over internet, Go to AWS ec2 console and find you ec2 instance.
You should find a "Public ipv4 address" associated with your instance.
Go to `http://{PUBLIC_IP_ADDRESS}` and see your application output.

Note: Make sure the `security group` of the ec2 instance allows HTTP traffic from anywhere in inbound rules.
