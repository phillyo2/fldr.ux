'use server';

/**
 * @fileOverview Provides suggestions for valid node connections based on node types and compatibility.
 *
 * - suggestNodeConnections -  Suggests valid connection points between nodes.
 * - SuggestNodeConnectionsInput - The input type for suggestNodeConnections.
 * - SuggestNodeConnectionsOutput - The return type for suggestNodeConnections.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestNodeConnectionsInputSchema = z.object({
  sourceNodeType: z.string().describe('The type of the source node.'),
  targetNodeType: z.string().describe('The type of the target node.'),
  sourcePortType: z.string().describe('The type of the source node output port.'),
  targetPortType: z.string().describe('The type of the target node input port.'),
  context: z
    .string()
    .optional()
    .describe('Additional context about the connection, if available.'),
});

export type SuggestNodeConnectionsInput = z.infer<typeof SuggestNodeConnectionsInputSchema>;

const SuggestNodeConnectionsOutputSchema = z.object({
  isValidConnection: z
    .boolean()
    .describe('Whether the connection between the nodes is valid.'),
  reason: z.string().optional().describe('The reason for the validity or invalidity.'),
});

export type SuggestNodeConnectionsOutput = z.infer<typeof SuggestNodeConnectionsOutputSchema>;

export async function suggestNodeConnections(input: SuggestNodeConnectionsInput): Promise<SuggestNodeConnectionsOutput> {
  return suggestNodeConnectionsFlow(input);
}

const suggestNodeConnectionsPrompt = ai.definePrompt({
  name: 'suggestNodeConnectionsPrompt',
  input: {schema: SuggestNodeConnectionsInputSchema},
  output: {schema: SuggestNodeConnectionsOutputSchema},
  prompt: `You are a node connection validator for a visual logic editor.  Given a source node type of "{{{sourceNodeType}}}", a target node type of "{{{targetNodeType}}}", a source port type of "{{{sourcePortType}}}", and a target port type of "{{{targetPortType}}}", determine if a connection between the nodes is valid.

Context: {{{context}}}

Return a JSON object indicating whether the connection is valid and a reason for the determination.  The JSON object should conform to the following schema:
\n{
  isValidConnection: boolean,
  reason?: string
}`,
});

const suggestNodeConnectionsFlow = ai.defineFlow(
  {
    name: 'suggestNodeConnectionsFlow',
    inputSchema: SuggestNodeConnectionsInputSchema,
    outputSchema: SuggestNodeConnectionsOutputSchema,
  },
  async input => {
    const {output} = await suggestNodeConnectionsPrompt(input);
    return output!;
  }
);
