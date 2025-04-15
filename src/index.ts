/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { v4 as uuidv4 } from "uuid";

export interface Env {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  AWS_BEDROCK_AGENT_ID: string;
  AWS_BEDROCK_AGENT_ALIAS_ID: string;
}

/**
 * Cloudflare Worker that calls AWS Bedrock Agent
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
				},
			});
		}

		try {
			const requestData: { userToken: string, tenantAccessToken: string, userInput: string, agentId: string, agentAliasId: string, userUuid: string, endSession: boolean } = await request.json();

			// Extract session attributes and user input
			const { userToken, tenantAccessToken, userInput, agentId, agentAliasId, userUuid, endSession } = requestData;

			if (!userInput || !userToken || !tenantAccessToken) {
				return new Response(JSON.stringify({ error: "Missing required params" }), { status: 400 });
			}

			// Initialize AWS Bedrock Client
			const bedrockClient = new BedrockAgentRuntimeClient({
				region: env.AWS_REGION,
				credentials: {
					accessKeyId: env.AWS_ACCESS_KEY_ID,
					secretAccessKey: env.AWS_SECRET_ACCESS_KEY
				}
			});

			const sessionId = userUuid || uuidv4();


			// Invoke Bedrock Agent
			const command = new InvokeAgentCommand({
				agentId: agentId || env.AWS_BEDROCK_AGENT_ID,
				sessionState: {
					sessionAttributes: { userToken, tenantAccessToken }
				},
				agentAliasId: agentAliasId || env.AWS_BEDROCK_AGENT_ALIAS_ID,
				sessionId: sessionId,
				inputText: userInput,
				enableTrace: true,
				endSession: endSession || false,
			});

			const response = await bedrockClient.send(command);

			let completion = "";
			if (response.completion === undefined) {
				throw new Error("Completion is undefined");
			}

			for await (const chunkEvent of response.completion) {
				const chunk = chunkEvent.chunk;
				console.log(chunk);
				const decodedResponse = new TextDecoder("utf-8").decode(chunk?.bytes);
				completion += decodedResponse;
			}

			// Return the response from the Bedrock Agent
			return new Response(JSON.stringify({ sessionId: sessionId, completion }), {
				headers: {
					"Content-Type": "application/json",
					"Access-Control-Allow-Origin": "*",
				},
			});

		} catch (error) {
			console.error("Error invoking Bedrock Agent:", error);
			return new Response(JSON.stringify({ error: "Failed to call Bedrock Agent" }), {
				status: 500,
				headers: {
					"Access-Control-Allow-Origin": "*",
				},
			});
		}
	}
};

