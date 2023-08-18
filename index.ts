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
  ListTaskDefinitionsCommand,
  RegisterTaskDefinitionCommand,
  Tag,
  TaskDefinition,
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
  }

  const client = new ECSClient();

  let oldTaskDefinitionArn = '';
  let taskDefinition: TaskDefinition = {};
  let tags: Tag[] | undefined;
  await group('Fetching latest revision of the task definition', async () => {
    {
      const response = await client.send(
        new ListTaskDefinitionsCommand({
          familyPrefix: family,
          sort: 'DESC',
        }),
      );

      const taskDefinitionArns = response.taskDefinitionArns ?? [];
      if (taskDefinitionArns.length < 1) {
        throw new Error('The family has no task definitions.');
      }

      oldTaskDefinitionArn = taskDefinitionArns[0];
    }

    {
      const response = await client.send(
        new DescribeTaskDefinitionCommand({
          taskDefinition: oldTaskDefinitionArn,
        }),
      );

      if (!response.taskDefinition) {
        throw new Error('The task definition can not be retrieved.');
      }

      taskDefinition = response.taskDefinition;
      tags = response.tags;
    }

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
    const response = await client.send(
      new RegisterTaskDefinitionCommand({
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
        tags: tags,
        taskRoleArn: taskDefinition.taskRoleArn,
        volumes: taskDefinition.volumes,
      }),
    );

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
