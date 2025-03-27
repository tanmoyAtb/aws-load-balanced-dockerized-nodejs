# Part 3 - CI/CD dockerized app with AWS Code Build, Code Pipeline and Github

Continuous integration and deployment is the core of devops pipelines. We want to continuously update code to our repository and push the changes to staging and production. In previous articles, we created a sample nodejs app, dockerized it and then created an auto scaled and load balanced ec2 cluster that hosts our app.

We will now create a devops pipeline. Our code maybe hosted in any Git provider, we will use Github here. Make sure your code is hosted in a Github repository.

We will follow the following steps:

1. Create a Code Build that will connect to Github, Build our application and update Docker image in AWS ECR
2. Create a Code pipeline that use use Code Deploy to update code in our EC2 instances.

## AWS Code build to build and update Docker Image in ECR

In this section, we will add code build scripts in our application code and then Create a AWS Code Build flow which will build and update our Docker image. But before that make sure you application in available on github (Or any other platform)

Before we start working on AWS side, we need to work on our codebase first and create a buildspec.yml file.
[This](https://github.com/tanmoyAtb/aws-load-balanced-dockerized-nodejs) is the repository of sample nodejs app.

Now create a `buildspec.yml` file.

```bash
# Do not change version. This is the version of aws buildspec, not the version of your buildspec file.
version: 0.2

env:
  variables:
    AWS_REGION: "<aws_region>" # like "ap-south-1"
    AWS_ACCOUNT_ID: "<aws_account_id>" # the aws account id, find in ECR repository
    IMAGE_REPO_NAME: "my-app" # your repository name in ECR
    IMAGE_TAG: "latest" # use latest or the tag you are using
  parameter-store:
    APP_NAME: "/my-app/APP_NAME" # your environment variables
phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
  build:
    commands:
      - echo Build started on `date`
      - echo Building the Docker image...
      - docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .
      - docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG
  post_build:
    commands:
      - echo Build completed on `date`
      - echo Pushing the Docker image...
      - docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG
```

What we are doing here is:

- Defining variables that refer to our AWS account or AWS ECR
- Defining parameter store environment variables
- The build flow to login to ECR, build out docker image and push new image to ECR

Now that our `buildspec.yml` file is ready, commit and push it and go to AWS panel

Now, we will go to AWS and create our CodeBuild project, but before we do that, we need to create a role for our AWS CodeBuild.

In AWS panel, search for "IAM" and go to "roles". Now "Create role".

- Select "AWS service" for the role and "CodeBuild" as the service.
- Add these permissions `AmazonEC2ContainerRegistryFullAccess`, `AmazonSSMFullAccess`. These are permissions for ECR and parameter store
- Use a name like `my-app-code-build-role`
- Click **Create role**
  Now go to the AWS panel and search for "AWS CodeBuild", go to the panel and click "Create Project".

Now follow these steps:

- Use a name like "my-app-code-build", and use "Default" project for Project type
- For "source", use "Github" (or any other), connect your github repo or use public repo
- For environment, use "on-demand", "Managed image", "EC2", "Container"
- For operating system, use Ubuntu and standard runtime
- For service role, choose the `my-app-code-build-role` we create earlier.
- Under buildspec, choose **Use a buildspec file**. This will use the `buildspec.yml` we added in code base.
- For artifacts, use "No artifacts" as we will simply update ECR.
- Now click "Create project"

[Create code build_1](Create_code_build_1.png)
[Create code build_2](Create_code_build_2.png)
[Create code build_3](Create_code_build_3.png)

You can now go to your Code Build project and click "Start build" to see your build in action.

## AWS Code pipeline to deploy to EC2 instances

Before we start deploying to our instances, we need to tell our code base what to do when a new deployment starts.
In our codebase, create a folder called `aws-scripts`

Now create the 3 following files in the folder

`application_start.sh`, `application_stop.sh`, `before_install.sh`

In `before_install.sh` and `application_stop.sh` paste the following

**before_install.sh**

```bash
#!/bin/bash
echo "Before install"
```

**application_stop.sh**

```bash
#!/bin/bash
echo "Application stop"
```

Now in `application_start.sh`, we do our application update work. What we do here:

- Define our variables on AWS
- login to ECR
- update `.env` file with latest variables from AWS parameter store
- stop docker containers, clean images, pull out application docker image
- Rerun the application docker image
- Rerun nginx server to serve our application

```bash
#!/bin/bash

# aws-scripts/application_start.sh
cd /home/ubuntu

AWS_ACCOUNT_ID="<aws_account_id>"
AWS_REGION="<aws_region>"
IMAGE_TAG="latest"
APP_NAME="my-app"
PORT="8000"

# pulling docker image
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker pull $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$APP_NAME:$IMAGE_TAG

# setting env
aws ssm get-parameters-by-path \
    --path "/${APP_NAME}" --recursive --with-decrypt \
    | jq -r '.Parameters[] | (.Name | split("/")[-1]) + "=" + (.Value)' \
    | tee /home/ubuntu/.env

# Stop existing container
docker stop $(docker ps -q)

# Remove unused containers and images (optional)
docker system prune -f

# Run Docker image
docker run --env-file .env -p $PORT:$PORT -d $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/my-app:latest

sudo nginx -t
sudo service nginx restart
```

After the `aws-scripts` are ready, we need to create a `appspec.yml` file in the base of our repository. This file tells AWS code deploy where to find scripts to run on a new deployment.

Use the following code in the `appspec.yml` file. This tells the instance which scripts to run and what file behaviors are to be used.

```bash
version: 0.0
os: linux
files:
  - source: /
    destination: /home/ubuntu/my-app
    overwrite: true
hooks:
  ApplicationStart:
    - location: aws-scripts/application_start.sh
      timeout: 3000
      runas: ubuntu
file_exists_behavior: OVERWRITE
```

Now that our deployment scripts are ready, we are ready to create our code deployment pipeline. But before that we need to create a AWS role again.

Go to IAM roles and hit click "Create role",

- Use **AWS service** and use **CodeDeploy** as service
- Under permissions, keep it with only `AWSCodeDeployRole`
- use a name like "my-app-code-deploy-role" and hit "Create role"

After creating the role, we need to add some add some extra permissions to the role. Click on the role, and hit "Add permissions" and then "Attach policies"

Under policies add the following permissions:
`AmazonEC2ContainerRegistryFullAccess`, `AmazonS3FullAccess`, `AutoScalingFullAccess`, `AWSCodePipeline_FullAccess`, `AWSCodeDeployRole`

These are required to access auto scaling ec2 instances, s3 to use artifacts, code pipeline and parameter store.

Now that the role is ready, we go to AWS panel and search for "AWS CodeDeploy" and go to "applications". Click "Create application".

- Add a name like "my-app-code-deployment-application"
- use **EC2/on-premises** as compute platform

[Create code deployment application](Create_code_deployment_application.png)

Click "Create application", now that application is ready. Now we create a "Create deployment group"

Follow these steps

- Use a application deployment group name like "my-app-deployment-group-name"
- Use the service role we created before `my-app-code-deploy-role`. Sometimes this way of using role does not group. If you face issues, Create a new service role here.
- Under environment configuration, select **Amazon EC2 Auto Scaling groups** and choose our target group **my-app-tg**
- Under deployment settings, use **CodeDeployDefault.AllAtOnce**
- Under load balancer, make sure to **uncheck load balancing**

That's it now hit "Create deployment group"

[Create code deployment group 1](Create_code_deployment_group_1.png)
[Create code deployment group 2](Create_code_deployment_group_2.png)
[Create code deployment group 3](Create_code_deployment_group_3.png)

Now that our code deploy application is ready, we can finally create our code pipeline. This pipeline will fire every time a code is pushed to `main` branch in github and this will update our application.

In AWS panel, go to AWS CodePipeline and click "Create Code pipeline"

- Under creation options, choose "Build custom pipeline"
- Use a name like "my-app-code-pipeline" and use "queued" as execution mode
- Under service role, create a new service role. We do not need a previous service role.
- Under source, select **Github (via Github app)**, choose your repository and branch (`main`). This will fire the pipeline when you push to `main` branch
- Under **webhook events**, select **start your pipeline on push or push request event** and under **webhook event filters**, choose **event type** as **Push**, **Filter type** as **Branch** and branch as **main**. This will make sure only push to main will start the pipeline. Click next.
- Under build stage, we will use the CodeBuild project we had created before. Choose **Other build providers** and choose **AWS code build**, select **my-app-code-build**. No need to add any environment variables as we use them from parameter store. Make sure **No artifacts** are added. Click next.
- Skip the test stage
- Under deploy, choose **CodeDeploy**. Make sure **No artifacts** are chosen. Choose our my app application and application group. Click next.
- In next page, review all the configuration and click **Create pipeline**

[Create code pipeline 1](Create_code_pipeline_1.png)
[Create code pipeline 2](Create_code_pipeline_2.png)
[Create code pipeline 3](Create_code_pipeline_3.png)
[Create code pipeline 4](Create_code_pipeline_4.png)
[Create code pipeline 5](Create_code_pipeline_5.png)
[Create code pipeline 6](Create_code_pipeline_6.png)

**Note**: Sometime the **No artifacts** chosen create problems, If they create problems, you can use **SourceArtifacts**

Now go ahead inside you Code pipeline and hit **Release change**. This will start releasing your application to running instances.

To check our changes in action:

- Push a change to your `main` branch
- See the Code Build your application and push to ECR
- See the Code Deploy update your instances to latest code

Now you have an auto scaled, continuously deployable, load balanced application. :tada
