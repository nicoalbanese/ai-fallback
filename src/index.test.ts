import { test, expect } from 'vitest'
import { z } from 'zod'
import { createFallback } from './index.js'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, streamText, streamObject } from 'ai'

const openai = createOpenAI({
    apiKey: process.env.OPENAI_KEY,
})

const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
})

test('createProvider works', async () => {
    const model = createFallback({
        models: [anthropic('claude-3-haiku-20240307'), openai('gpt-3.5-turbo')],
    })

    const result = await generateText({
        model,
        system: 'You are a sentiment analysis expert. Analyze the sentiment of any text provided and respond with either POSITIVE, NEGATIVE, or NEUTRAL.',
        messages: [
            { role: 'user', content: 'I love this product! It works great.' },
        ],
    })

    expect(result.text).toMatchInlineSnapshot('"POSITIVE"')
})

test('switches model on error', async () => {
    const model = createFallback({
        models: [
            createOpenAI({ apiKey: 'wrong-key' })('gpt-3.5-turbo'),
            anthropic('claude-3-haiku-20240307'),
        ],
    })
    
    model.currentModelIndex = 0

    const result = await generateText({
        model,
        system: 'You only respond hello',
        messages: [{ role: 'user', content: 'Say hello' }],
    })

    // After error with OpenAI, should have switched to Anthropic
    expect(model.currentModelIndex).toBe(1)
    expect(model.modelId).toBe('claude-3-haiku-20240307')
    expect(result.text).toBeTruthy()
    model.currentModelIndex = 0
})

test('streamText works', async () => {
    const model = createFallback({
        models: [anthropic('claude-3-haiku-20240307'), openai('gpt-3.5-turbo')],
    })

    const stream = await streamText({
        model,
        system: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'Count from 1 to 5.' }],
    })

    let text = ''
    for await (const chunk of stream.textStream) {
        text += chunk
    }

    expect(text).toContain('1')
    expect(text).toContain('5')
})

test('streamObject works', async () => {
    const model = createFallback({
        models: [anthropic('claude-3-haiku-20240307'), openai('gpt-3.5-turbo')],
    })

    const stream = await streamObject({
        model,
        system: 'You are a helpful assistant.',
        messages: [
            {
                role: 'user',
                content:
                    'Give me a person object with name and age properties.',
            },
        ],
        schema: z.object({
            name: z.string(),
            age: z.number(),
        }),
    })

    let result
    for await (const chunk of stream.partialObjectStream) {
        result = chunk
    }

    expect(result).toHaveProperty('name')
    expect(result).toHaveProperty('age')
    expect(typeof result.name).toBe('string')
    expect(typeof result.age).toBe('number')
})

test('ReadableStream works like i expect', async () => {
    // Create a stream that will error
    const errorStream = new ReadableStream({
        start(controller) {
            controller.error(new Error('Test stream error'))
        },
    })

    // Test that the error is thrown when consuming the stream
    let error: Error | undefined
    try {
        const reader = errorStream.getReader()
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            // Should not get here
            console.log(value)
        }
    } catch (e) {
        error = e as Error
    }

    expect(error).toBeDefined()
    expect(error?.message).toBe('Test stream error')
})
