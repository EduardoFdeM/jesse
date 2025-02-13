interface CostTracking {
    translationId: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
}

interface CostData {
    cost: number;
    inputTokens: number;
    outputTokens: number;
    model: string;
    timestamp: string;
}

export const calculateTranslationCost = async (tracking: CostTracking): Promise<CostData> => {
    const rates = {
        'gpt-4-turbo-preview': {
            input: 0.01,
            output: 0.03
        },
        'gpt-3.5-turbo-0125': {
            input: 0.0005,
            output: 0.0015
        }
    };

    const modelRates = rates[tracking.model as keyof typeof rates] || rates['gpt-3.5-turbo-0125'];
    
    const inputCost = (tracking.inputTokens / 1000) * modelRates.input;
    const outputCost = (tracking.outputTokens / 1000) * modelRates.output;
    
    return {
        cost: Number((inputCost + outputCost).toFixed(4)),
        inputTokens: tracking.inputTokens,
        outputTokens: tracking.outputTokens,
        model: tracking.model,
        timestamp: new Date().toISOString()
    };
}; 