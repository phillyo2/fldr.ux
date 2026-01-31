'use server';

/**
 * @fileOverview Generates executable JavaScript code from a visual logic flow.
 *
 * - generateCode - A function that takes a visual logic flow as input and returns JavaScript code.
 * - GenerateCodeInput - The input type for the generateCode function, representing the visual logic flow.
 * - GenerateCodeOutput - The return type for the generateCode function, representing the generated JavaScript code.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateCodeInputSchema = z.object({
  flowDiagram: z
    .string()
    .describe(
      'A string representation of the visual logic flow diagram.  This could be a JSON representation of the diagram or some other structured format.'
    ),
});
export type GenerateCodeInput = z.infer<typeof GenerateCodeInputSchema>;

const GenerateCodeOutputSchema = z.object({
  javaScriptCode: z
    .string()
    .describe('The generated JavaScript code representing the visual logic flow.'),
});
export type GenerateCodeOutput = z.infer<typeof GenerateCodeOutputSchema>;

export async function generateCode(input: GenerateCodeInput): Promise<GenerateCodeOutput> {
  return generateCodeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCodePrompt',
  input: {schema: GenerateCodeInputSchema},
  output: {schema: GenerateCodeOutputSchema},
  prompt: `You are a expert software engineer who translates visual logic flow diagrams into executable JavaScript code.

  Given the following visual logic flow diagram:
  \`\`\`
  {{{flowDiagram}}}
  \`\`\`

  Generate JavaScript code that implements the logic described in the diagram.  The code should be well-formatted, readable, and efficient.  Include comments to explain the purpose of each section of the code.
  Make sure the code is valid javascript, and can be directly executed.
  Do not include any testing or example code, just the core javascript implementation.
  `, // end prompt
});

const generateCodeFlow = ai.defineFlow(
  {
    name: 'generateCodeFlow',
    inputSchema: GenerateCodeInputSchema,
    outputSchema: GenerateCodeOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
