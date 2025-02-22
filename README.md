# Update ECS Task Definition Action

> [!WARNING]
> This is not an official product of YUMEMI Inc.

Updates an ECS task definition with single or multiple containers, replacing their image references.


## Usage

```yaml
permissions:
  contents: read
  id-token: write
steps:
  - name: Configure AWS Credentials
    uses: aws-actions/configure-aws-credentials@v2
    with:
      role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
      aws-region: us-east-2

  - name: Update Task Definition
    uses: yumemi-inc/update-ecs-task-definition-action@v1
    with:
      family: my-task-definition
      images: |
        app=123456789100.dkr.us-east-2.amazonaws.com/my-app:latest
        otel-collector=ghcr.io/my-org/my-otel-collector:v1
```


## Inputs

| Name   | Type           | Description                                                                                                              |
|--------|----------------|--------------------------------------------------------------------------------------------------------------------------|
| family | string         | Name of the task definition family to where fetch the latest revision and create a new revision.                         |
| image  | List\<string\> | Map of the container name and the image URI to update in the task definition. Must be `container_name=image_uri` format. |                   |

## Outputs

| Name                    | Type           | Description                                     |
|-------------------------|----------------|-------------------------------------------------|
| task-definition         | JSON\<Object\> | Updated task definition payload.                |
| old-task-definition-arn | string         | ARN of the old revision of the task definition. |
| new-task-definition-arn | string         | ARN of the new revision of the task definition. |
