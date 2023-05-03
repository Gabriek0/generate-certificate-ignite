import { APIGatewayProxyHandler } from "aws-lambda";

import { document } from "../utils/dynamodb-client";

import dayjs from "dayjs";
import { join } from "path";
import { readFileSync } from "fs";
import { compile } from "handlebars";

import chromium from "chrome-aws-lambda";

interface ICreateCertificate {
  id: string;
  name: string;
  grade: string;
}

interface ITemplate {
  id: string;
  name: string;
  grade: string;
  medal: string;
  date: string;
}

const compileTemplate = async (data: ITemplate) => {
  const filePath = join(process.cwd(), "src", "templates", "certificate.hbs");

  const html = readFileSync(filePath, "utf-8");

  return compile(html)(data);
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const { id, name, grade } = JSON.parse(event.body) as ICreateCertificate;

  document
    .put({
      TableName: "users_certificate",
      Item: {
        id,
        name,
        grade,
        created_at: new Date().getTime(),
      },
    })
    .promise();

  const response = await document
    .query({
      TableName: "users_certificate",
      KeyConditionExpression: "id = :id",
      ExpressionAttributeValues: {
        ":id": id,
      },
    })
    .promise();

  const medalPath = join(process.cwd(), "src", "templates", "selo.png");
  const medal = readFileSync(medalPath, "base64");

  const data: ITemplate = {
    id,
    name,
    grade,
    date: dayjs().format("DD/MM/YYYY"),
    medal: medal,
  };

  const content = await compileTemplate(data);

  const browser = await chromium.puppeteer.launch({
    args: chromium.args,
    headless: chromium.headless,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
  });

  const page = await browser.newPage();

  await page.setContent(content);
  await page.pdf({
    format: "a4",
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
    path: process.env.IS_OFFILE ? "./certificate.pdf" : null,
  });

  await browser.close();

  return {
    statusCode: 201,
    body: JSON.stringify(response.Items[0]),
  };
};
