import prisma from '../prisma';
import { readAiSettings } from '../routes/settings';

/**
 * Catégorisation automatique par IA.
 *
 * Envoie les transactions non catégorisées à un endpoint LLM (Ollama, OpenAI,
 * etc.) qui renvoie la catégorie la plus appropriée parmi celles existantes.
 * Seules les transactions sans categoryId ou avec categoryId null sont traitées.
 * Une transaction catégorisée manuellement (categoryId défini, aiCategorized=false)
 * n'est jamais écrasée.
 */

interface AiCategoryResponse {
  transactions: Array<{ id: string; categoryId: string }>;
}

/**
 * Appelle l'endpoint IA pour catégoriser un lot de transactions.
 */
async function callAiEndpoint(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const isOpenAiLike = endpoint.includes('openai.com') || endpoint.includes('api.openai');

  if (isOpenAiLike) {
    const res = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  // Ollama (ou compatible)
  const res = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'llama3',
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.message?.content ?? '';
}

/**
 * Catégorise les transactions non catégorisées.
 * Appelé après un sync bancaire ou manuellement.
 */
export async function categorizeUncategorized(): Promise<{ categorized: number; errors: number }> {
  const settings = readAiSettings();
  if (!settings.enabled || !settings.endpoint) {
    return { categorized: 0, errors: 0 };
  }

  // Récupérer les transactions sans catégorie (jamais catégorisées ou manuellement vidées)
  const uncategorized = await prisma.transaction.findMany({
    where: {
      categoryId: null,
      // Exclure les investissements
      bank: { accountType: { not: 'INVESTMENT' } },
    },
    select: {
      id: true,
      description: true,
      amount: true,
      date: true,
      bank: {
        select: { name: true, accountType: true },
      },
    },
    orderBy: { date: 'desc' },
    take: 100, // Limite par batch
  });

  if (uncategorized.length === 0) {
    return { categorized: 0, errors: 0 };
  }

  // Récupérer les catégories disponibles
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, type: true },
  });

  if (categories.length === 0) {
    return { categorized: 0, errors: 0 };
  }

  const categoryList = categories
    .map((c) => `- id: "${c.id}" | name: "${c.name}" | type: "${c.type}"`)
    .join('\n');

  // Construire la liste des transactions pour le prompt
  const txList = uncategorized
    .map(
      (tx) =>
        `- id: "${tx.id}" | description: "${tx.description.replace(/"/g, "'")}" | amount: ${tx.amount} | date: ${tx.date.toISOString().split('T')[0]} | bank: "${tx.bank.name}"`,
    )
    .join('\n');

  const prompt = `Tu es un assistant de catégorisation financière. Catégorise chaque transaction dans la liste en choisissant la catégorie la plus appropriée.

CATÉGORIES DISPONIBLES:
${categoryList}

TRANSACTIONS À CATÉGORISER:
${txList}

Réponds UNIQUEMENT avec un objet JSON de cette forme:
{"transactions": [{"id": "...", "categoryId": "..."}]}

Règles:
- Si aucune catégorie ne correspond, mets categoryId: null
- Ne modifie PAS le champ "id" — c'est l'identifiant de la transaction
- Chaque transaction doit apparaître une seule fois dans ta réponse
- NE PAS créer de nouvelles catégories, n'utiliser que celles listées ci-dessus`;

  try {
    const raw = await callAiEndpoint(
      settings.endpoint,
      settings.apiKey || '',
      settings.model || '',
      prompt,
    );

    // Parser la réponse JSON
    let parsed: AiCategoryResponse;
    try {
      // Nettoyer les blocs markdown si présents
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[AI] Réponse non-JSON:', raw.slice(0, 200));
      return { categorized: 0, errors: 1 };
    }

    if (!Array.isArray(parsed.transactions)) {
      return { categorized: 0, errors: 1 };
    }

    // Valider les catégories existantes
    const validCategoryIds = new Set(categories.map((c) => c.id));
    let categorized = 0;
    let errors = 0;

    for (const item of parsed.transactions) {
      if (!item.id || !item.categoryId) continue;
      if (!validCategoryIds.has(item.categoryId)) {
        errors++;
        continue;
      }

      try {
        await prisma.transaction.update({
          where: { id: item.id },
          data: {
            categoryId: item.categoryId,
            aiCategorized: true,
          },
        });
        categorized++;
      } catch {
        errors++;
      }
    }

    console.log(`[AI] Catégorisation: ${categorized} transactions, ${errors} erreurs`);
    return { categorized, errors };
  } catch (error: any) {
    console.error('[AI] Erreur:', error.message);
    return { categorized: 0, errors: 1 };
  }
}
