const inquirer = require("inquirer");
const setup = require("./setup");

function runInquirer(cwp) {
    if (!cwp.interactive) {
        return setup(cwp);
    }

    console.log(
        "In order to setup your new Webiny project, please answer the following questions."
    );
    console.log();
    inquirer
        .prompt([
            {
                type: "list",
                name: "region",
                default: "us-east-1",
                message: "Please choose the AWS region in which your new project will be deployed:",
                choices: [
                    { value: "us-east-1", name: "us-east-1 (US East, N. Virginia)" },
                    { value: "us-east-2", name: "us-east-2 (US East, Ohio)" },
                    { value: "us-west-1", name: "us-west-1 (US West, N. California)" },
                    { value: "us-west-2", name: "us-west-2 (US West, Oregon)" },
                    { value: "ca-central-1", name: "ca-central-1 (Canada, Central)" },
                    { value: "eu-central-1", name: "eu-central-1 (EU, Frankfurt)" },
                    { value: "eu-west-1", name: "eu-west-1 (EU, Ireland)" },
                    { value: "eu-west-2", name: "eu-west-2 (EU, London)" },
                    { value: "eu-south-1", name: "eu-south-1 (EU, Milan)" },
                    { value: "eu-west-3", name: "eu-west-3 (EU, Paris)" },
                    { value: "eu-north-1", name: "eu-north-1 (EU, Stockholm)" },
                    { value: "af-south-1", name: "af-south-1 (Africa, Cape Town)" },
                    { value: "ap-east-1", name: "ap-east-1 (Asia Pacific, Hong Kong)" },
                    { value: "ap-south-1", name: "ap-south-1 (Asia Pacific, Mumbai)" },
                    { value: "ap-northeast-2", name: "ap-northeast-2 (Asia Pacific, Seoul)" },
                    { value: "ap-southeast-1", name: "ap-southeast-1 (Asia Pacific, Singapore)" },
                    { value: "ap-southeast-2", name: "ap-southeast-2 (Asia Pacific, Sydney)" },
                    { value: "ap-northeast-1", name: "ap-northeast-1 (Asia Pacific, Tokyo)" },
                    { value: "me-south-1", name: "me-south-1 (Middle East, Bahrain)" },
                    { value: "sa-east-1", name: "sa-east-1 (South America, São Paulo)" }
                ]
            },
            {
                type: "list",
                name: "vpc",
                default: false,
                message:
                    "Do you want to have your API project application deployed into a custom Virtual Private Cloud (VPC)?",
                choices: [
                    {
                        name:
                            "Yes (includes private subnets and a NAT Gateway, more secure, incurs cost)",
                        value: true
                    },
                    {
                        name:
                            "No, use the default VPC (less secure, all deployed resources are free tier eligible)",
                        value: false
                    }
                ]
            }
        ])
        .then(templateOptions => setup({ ...cwp, templateOptions }))
        .catch(e => {
            if (e.isTtyError) {
                console.log("Could not start setup wizard in current environment.");
            } else {
                console.log("Something went wrong:");
                console.log(e);
            }
        });
}

module.exports = runInquirer;
