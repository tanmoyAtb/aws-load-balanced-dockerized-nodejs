### Deploying a nodejs application to aws load balancer with continuous deployment

## The application with launch template

Horizontal load balancing is a concept where the same instance of a server is run on multiple machines. The load balancer will automatically create or destroy instances of the server depending on traffic and distribute the incoming requests to different instances. This ensures that the application remains fast and reliable throughout variable traffic. Continuous deployment is a process where new code or updates are automatically pushed to production instances seamlessly without stopping running servers.

In this tutorial series, we will load balance a nodejs server on AWS and then implement continuous deployment. The tutorial is divided into 3 parts as follows.

# Part 1 - Creating application launch template

    - Create a linux image which has required packages installed.
    - Create a launch template with initial scripts and application environment.
    - Test launch template by creating an ec2 instance that runs our server.

# Part 2 - Deploying application load balancer

    - Create an AWS EC2 auto scaling group with maximum and minimum capacity
    - Create AWS EC2 target groups with health monitoring
    - Create a AWS Application load balancer with listener rules.

# Part 3 - Implementing continuous deployment

    - Updating the linux image with deployment service
    - Creating build and application scripts in codebase
    - Creating code pipeline and code deployment

## Part 1 - Creating application launch template

We will first create an EC2 instance, install necessary packages, clone our repository and then create an image from the instance. Let's go ahead and create an EC2 instance. Search EC2 in aws console and select launch instance. Use Ubuntu 20 image, and select any instance as per your requirements. I will select t3a.small. Now,

Create a security group and name it `myapp-nodejs-server-ec2-security-group`. For rules, add `0.0.0.0/0`, this will allow traffic from all requests (We will change this later).

Name the instance, `myapp-node-server-custom-ec2-instance`. Now hit `Launch Instance`. It will take some time for the instance to startup.

On the EC2 console, click on the newly create ec2 instance and hit `Connect`. Here on the user field, type in `root` and connect. You should now see command line of the ec2 instance.

Tip: It is important to login as `root`. ec2 startup scripts and deployment scripts run as `root`. So we will have to install and configure packages as root to make sure aws scripts find these packages later.

First, make sure you are logged in as root. `whoami` should output `root`. export HOME, to make sure HOME points to right directory.

```
whoami
export HOME=~
```

Now let's update system packages and install required packages.

```
sudo apt-get update -y
sudo apt-get install openssh-client -y
sudo apt-get install curl -y
sudo apt-get install ruby -y
sudo apt-get install wget -y
```

We will now install `nvm`, a node version manager, which will be used to install node. nvm is very handy as it can easily be used to change node versions in future.
I will be installing nvm 0.39.5 and node 20. You can install versions of your choice.

```
# use the latest/preferred nvm version
sudo curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
. ~/.nvm/nvm.sh
nvm --version
```

Now, let's install nodejs and yarn (optional). Make sure the versions and paths are printed correctly.

```
nvm install 20
which node
node --version
npm --version
npm install --global yarn
yarn --version
```

We will also install pm2, a nodejs background job manager, which will be used to run our server.

```
npm install --global pm2
pm2 --version
pm2 status
```

<!-- Setup github and repo -->

# Application environment variables

Environment variables are ubiquitous in any production grade application and managing environments elegantly and securely is crucial.
For our use case we will use aws system manager parameter store or SSM parameter store. SSM parameter store is a place where you can store key value pairs, non-encrypted or encrypted, and then use those parameters in all types of pipelines across cloud services such as your application environment, code build, code pipeline etc. Learn more about SSM parameters here.

Search for Parameter store in aws and go to its panel. Now create required variables. In our case, we will create two variables `DB_URL` and `PORT`.
We will name them `/myapp/prod/PORT` with value `5000` and `/myapp/prod/SECRET` with any secret you like.

## Part 2 - Deploying application load balancer

## Part 3 - Implementing continuous deployment
