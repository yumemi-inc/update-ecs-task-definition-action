import { exit } from 'node:process';

import {
  error,
  getInput,
  getMultilineInput,
  group,
  setOutput,
} from '@actions/core';
import {
  DescribeTaskDefinitionCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
  type Tag,
  type TaskDefinition,
} from '@aws-sdk/client-ecs';

const getInputRequired = (name: string) =>
  getInput(name, {
    required: true,
  });

(async () => {
  const family = getInputRequired('family');
  const images = getMultilineInput('images', {
    required: true,
  });

  const imageUpdates: Record<string, string> = {};
  for (const image of images) {
    const parts = image.split('=', 2);
    if (parts.length < 2) {
      throw new Error(
        `Malformed images reference. Expected 'container_name=image_uri' format, got '${image}'`,
      );
    }

    imageUpdates[parts[0]] = parts[1];
  }

  const client = new ECSClient();

  let oldTaskDefinitionArn = '';
  let taskDefinition: TaskDefinition = {};
  let tags: Tag[] | undefined;
  await group('Fetching latest revision of the task definition', async () => {
    const response = await client.send(
      new DescribeTaskDefinitionCommand({
        include: ['TAGS'],
        taskDefinition: family,
      }),
    );

    if (
      !response.taskDefinition ||
      !response.taskDefinition.taskDefinitionArn
    ) {
      throw new Error('The task definition can not be retrieved.');
    }

    oldTaskDefinitionArn = response.taskDefinition.taskDefinitionArn;
    taskDefinition = response.taskDefinition;
    tags = response.tags;

    console.log(`✅ Fetched latest task definition: ${oldTaskDefinitionArn}`);
  });

  await group('Current task definition', async () => {
    console.log(JSON.stringify(taskDefinition, null, 2));
  });

  await group('Rendering a new revision with updating images', async () => {
    for (const [containerName, imageUri] of Object.entries(imageUpdates)) {
      const container = taskDefinition.containerDefinitions?.find(
        (c) => c.name === containerName,
      );
      if (!container) {
        throw new Error(
          `Could not find a container with name '${containerName}'.`,
        );
      }

      const oldImageUri = container.image;
      container.image = imageUri;

      console.log(`✅ Updated ${containerName}: ${oldImageUri} => ${imageUri}`);
    }
  });

  let newTaskDefinitionArn = '';
  await group('Updating the task definition', async () => {
    const command = new RegisterTaskDefinitionCommand({
      family: family,
      containerDefinitions: taskDefinition.containerDefinitions,
      cpu: taskDefinition.cpu,
      ephemeralStorage: taskDefinition.ephemeralStorage,
      executionRoleArn: taskDefinition.executionRoleArn,
      inferenceAccelerators: taskDefinition.inferenceAccelerators,
      ipcMode: taskDefinition.ipcMode,
      memory: taskDefinition.memory,
      networkMode: taskDefinition.networkMode,
      pidMode: taskDefinition.pidMode,
      placementConstraints: taskDefinition.placementConstraints,
      proxyConfiguration: taskDefinition.proxyConfiguration,
      requiresCompatibilities: taskDefinition.requiresCompatibilities,
      runtimePlatform: taskDefinition.runtimePlatform,
      taskRoleArn: taskDefinition.taskRoleArn,
      volumes: taskDefinition.volumes,
    });

    if ((tags?.length ?? 0) > 0) {
      command.input.tags = tags;
    }

    const response = await client.send(command);

    const arn = response.taskDefinition?.taskDefinitionArn;
    if (!arn) {
      throw new Error('Could not update the task definition.');
    }

    console.log(`✅ Updated task definition: ${arn}`);

    newTaskDefinitionArn = arn;
  });

  setOutput('task-definition', JSON.stringify(taskDefinition));
  setOutput('old-task-definition-arn', oldTaskDefinitionArn);
  setOutput('new-task-definition-arn', newTaskDefinitionArn);
})()
  .then()
  .catch((e) => {
    error(`❌ ${e}`);
    exit(1);
  });
