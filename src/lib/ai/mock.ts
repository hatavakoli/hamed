import { CHUNK_SUMMARY_SYSTEM_PROMPT } from './prompt'
import type { AiProvider, CompletionInput, CompletionResult } from './provider'

/**
 * Offline stand-in for Claude.
 *
 * It returns a fully schema-valid analysis built from the prompt's metadata, so
 * every downstream feature (reports, scores, digests, email) works with no
 * ANTHROPIC_API_KEY. Scores vary by title so the dashboard does not look flat.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock'
  readonly model = 'mock-analyst-v1'
  readonly supportsImages = true

  async complete(input: CompletionInput): Promise<CompletionResult> {
    // Simulate the "summarise this chunk" pass.
    if (input.system === CHUNK_SUMMARY_SYSTEM_PROMPT) {
      const label = /Section (\d+) of (\d+) \(([^)]*)\)/.exec(input.prompt)
      const text =
        `[Mock summary] Section ${label?.[1] ?? '1'} (${label?.[3] ?? 'unknown range'}) walks through the ` +
        `main argument of the video, introduces two concrete numbers as proof, opens a loop about what went wrong, ` +
        `and hands off to the next section with a direct question to the viewer. A tool is demonstrated briefly ` +
        `around the midpoint. Pacing is steady with one visual pattern interrupt.`
      return { text, inputTokens: Math.ceil(input.prompt.length / 4), outputTokens: 90, model: this.model }
    }

    // Simulate the weekly-digest pass.
    if (input.system.includes('weekly intelligence digest')) {
      return {
        text: JSON.stringify(mockDigest(input.prompt)),
        inputTokens: Math.ceil(input.prompt.length / 4),
        outputTokens: 520,
        model: this.model,
      }
    }

    const title = /Video title: (.*)/.exec(input.prompt)?.[1]?.trim() ?? 'Untitled video'
    const channel = /Channel: (.*)/.exec(input.prompt)?.[1]?.trim() ?? 'Unknown channel'
    const hasTranscript = /TRANSCRIPT STATUS: available/i.test(input.prompt)

    // Deterministic pseudo-random scores so a given title always scores the same.
    const seed = [...title].reduce((a, c) => a + c.charCodeAt(0), 0)
    const score = (offset: number) => ((seed + offset * 37) % 6) + 4 // 4..9
    const scorecard = {
      topicStrength: score(1),
      audienceSpecificity: score(2),
      titleStrength: score(3),
      hookStrength: score(4),
      structureRetentionPotential: score(5),
      differentiation: score(6),
      actionabilityValue: score(7),
      repurposingPotential: score(8),
      overall: 0,
    }
    const values = Object.values(scorecard).filter((v) => v > 0)
    scorecard.overall = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
    const verdict = scorecard.overall >= 7.5 ? 'strong' : scorecard.overall >= 5.5 ? 'average' : 'weak'

    const analysis = {
      coreTopic: title.split(/[—:|-]/)[0].trim().slice(0, 80) || 'Content strategy',
      premise: `A ${hasTranscript ? 'walkthrough' : 'video'} from ${channel} that promises a concrete outcome and backs it with a personal case study.`,
      targetAudience: {
        description:
          'Solo founders and early-stage builders who have shipped something small and want a repeatable process for finding demand before building.',
        experienceLevel: 'medium',
        painPoints: [
          'Builds products nobody asks for',
          'No repeatable way to find a validated problem',
          'Marketing budget is effectively zero',
        ],
        desires: ['First paying customers', 'A process they can trust', 'Proof that a small product can work'],
        fears: ['Wasting months on the wrong idea', 'Launching to silence'],
        motivations: ['Financial independence', 'Proof of competence', 'Freedom from client work'],
      },
      mainPromise: 'Follow this sequence and you will find a problem worth solving before you write any code.',
      format: {
        primary: 'case_study',
        secondary: 'tutorial',
        rationale: 'The video is framed around one personal result and then generalises it into repeatable steps.',
      },
      hook: {
        summary:
          'Opens by naming a specific outcome and a timeframe, then immediately undercuts it by admitting the presenter expected to fail.',
        type: 'Result reveal plus vulnerability',
        whyItMayWork:
          'A concrete number is easy to evaluate, and the admission of doubt likely lowers viewer scepticism early.',
        whyItMayNotWork:
          'The number arrives before the viewer knows why they should care, so it may read as another income-claim video.',
        strengthScore: scorecard.hookStrength,
      },
      structure: {
        sections: [
          { title: 'Cold open and result', timestamp: '00:00', summary: 'States the outcome and the timeframe.' },
          { title: 'The problem with the usual approach', timestamp: '01:30', summary: 'Frames the common mistake.' },
          { title: 'The three-step process', timestamp: '04:10', summary: 'Research, pick, ship the embarrassing version.' },
          { title: 'The numbers', timestamp: '09:45', summary: 'Month-by-month revenue breakdown.' },
          { title: 'What I would change', timestamp: '14:20', summary: 'Pricing and audience-first corrections.' },
        ],
        openLoops: ['"The part nobody talks about" is teased early and paid off in the middle'],
        patternInterrupts: ['Switch from talking head to spreadsheet at the numbers section'],
        narrativeArc: 'Doubt to result to method to caveat — a classic redemption shape.',
        pacingObservations: 'Front half is dense; the numbers section likely slows down and may lose casual viewers.',
      },
      script: {
        keyClaims: [
          { claim: 'Zero dollars were spent on paid acquisition.', basis: hasTranscript ? 'verified' : 'inferred', support: 'Stated directly in the opening.' },
          { claim: 'Demand research should precede building.', basis: 'inferred', support: 'Presented as the core thesis rather than proven.' },
        ],
        emotionalTriggers: ['Fear of wasted effort', 'Desire for a shortcut that is not a scam', 'Social proof via numbers'],
        repeatedThemes: ['Talk to people before you build', 'Ship something embarrassing'],
        clarityAndSpecificity:
          'Specific where it counts (numbers, timeframes) but vague about where the research communities actually were.',
        weakOrVagueSections: ['The "find the complaints" step lacks a concrete sourcing method'],
      },
      packaging: {
        titleAnalysis: 'Leads with a personal result and a constraint, which sets a clear expectation.',
        titleFormula: 'I did [specific thing] in [timeframe] — here is what [broke / happened]',
        curiosityGap: 'Moderate: the outcome is revealed but the method is withheld.',
        clarity: 'High. A viewer knows exactly what they are getting.',
        keywordTargeting: ['saas', 'validation', 'indie hacking', 'first customers'],
        thumbnailAnalysis: input.imageUrl
          ? 'High-contrast text with a single number as the focal point; likely readable at small sizes on mobile.'
          : null,
        alignmentNotes: 'Title, hook and delivery appear consistent; the payoff arrives roughly where the title implies.',
      },
      contentStrategy: {
        whyItCouldPerform: 'Evergreen demand, concrete proof, and a low-cost promise that matches the audience budget.',
        ideaStrengths: ['Specific numbers', 'Repeatable framework', 'Low barrier to trying it'],
        ideaWeaknesses: ['Single data point', 'Survivorship bias is not addressed'],
        audienceDemandServed: 'Reduce the risk of building the wrong thing.',
        differentiation: 'Moderate — the framing is common, the transparency of the numbers is less so.',
        missedOpportunities: ['No downloadable template', 'No failure case for contrast'],
        contentGapObservations: ['Nobody in this niche seems to cover what to do when the research finds no demand'],
      },
      productValidation: {
        productDiscussed: true,
        productIdea: 'A lightweight tool that collects and clusters complaints from public communities into ranked problem statements.',
        problemSolved: 'Founders have no structured way to turn scattered public complaints into a shortlist of validated problems.',
        marketDemandSignals: [
          'The manual version of this workflow is the centrepiece of the video',
          'Comment-count and view-count suggest sustained interest in validation content',
        ],
        feasibility: 'high',
        buildComplexity: 'medium',
        estimatedBuildEffort: '3–5 weeks for one full-stack developer using off-the-shelf APIs',
        suggestedStack: ['Next.js', 'PostgreSQL + Prisma', 'A hosted LLM for clustering', 'A background job runner'],
        mvpScope: [
          'Paste or import a list of source URLs',
          'Extract complaint-shaped sentences',
          'Cluster into themes with a frequency count',
          'Export the ranked list',
        ],
        improvementFeatures: [
          { feature: 'Severity and willingness-to-pay scoring per cluster', whyItMatters: 'Frequency alone does not mean people will pay.', effort: 'medium' },
          { feature: 'Existing-solution detection per cluster', whyItMatters: 'Shows whether the problem is already well served.', effort: 'medium' },
          { feature: 'Weekly digest of newly emerging complaints', whyItMatters: 'Turns a one-off tool into a retained subscription.', effort: 'low' },
        ],
        risks: ['Source platforms restrict automated access', 'Clustering quality drives the whole value proposition'],
        existingAlternatives: ['Generic social listening suites', 'Manual spreadsheet workflows'],
        buildVerdict: 'build',
        confidenceScore: 7,
        rationale:
          'The workflow is already being done manually by the target audience, the technical path is well understood, and the retention hook (weekly digest) is straightforward.',
      },
      ethicalInspiration: {
        strategiesToLearnFrom: [
          'Lead with a verifiable number rather than a promise',
          'Name the common mistake before presenting the method',
          'Show the unglamorous first version to build trust',
        ],
        whatNotToCopy: ['This creator’s exact phrasing, thumbnail design, and personal story'],
      },
      recommendations: {
        originalVideoIdeas: [
          { title: 'What To Do When Your Research Finds No Demand', angle: 'The failure path nobody documents.', whyItCouldWork: 'Serves the same audience at the moment they are most stuck.' },
          { title: 'The Spreadsheet I Use Before I Write Any Code', angle: 'Tool-first walkthrough with a free template.', whyItCouldWork: 'Turns an abstract process into something downloadable.' },
          { title: 'Charging More On Day One: A Pricing Post-Mortem', angle: 'One narrow decision examined in depth.', whyItCouldWork: 'Pricing regret is a widely shared, specific pain.' },
        ],
        alternativeTitles: [
          'I Ranked 400 Complaints. Only 6 Were Worth Building.',
          'The Validation Step Most Founders Skip',
          'Before You Build: A 14-Day Demand Test',
        ],
        hookIdeas: [
          'Open on the rejected ideas, not the winner.',
          'Start with the exact moment the first payment landed, then rewind.',
          'Lead with the cost of getting it wrong in hours, not dollars.',
        ],
        improvementSuggestions: [
          'Attach a template so the process is actionable on the first watch',
          'Include one counter-example where the method failed',
          'Move the revenue breakdown earlier to hold attention',
        ],
      },
      scorecard,
      executiveSummary: {
        summary:
          `This is a case-study video from ${channel} that turns one personal result into a three-step validation process. ` +
          `The opening leads with a concrete number, which likely earns attention quickly, and the admission of early doubt may lower viewer scepticism. ` +
          `The strongest section is the month-by-month revenue breakdown, because it is specific and verifiable in a niche full of vague claims. ` +
          `The weakest part is the research step, which suggests a method without showing where the source material actually came from. ` +
          `Differentiation is moderate: the framing is common, but the transparency is above average for the category. ` +
          `There is a clear product idea embedded in the workflow that appears genuinely buildable in about a month. ` +
          `${hasTranscript ? 'This analysis used the full transcript.' : 'No transcript was available, so structural observations are inferred from metadata only and should be treated as low confidence.'}`,
        verdict,
        mostImportantTakeaway:
          'The reusable asset here is the sequence — research, pick by frequency, ship an embarrassing version — not the specific numbers.',
        topTakeaways: [
          'Leading with a verifiable number is doing most of the retention work in the first 30 seconds.',
          'The research step is the weakest link and the most obvious gap to fill with an original video.',
          'The manual workflow described is a credible product opportunity with a clear MVP.',
        ],
      },
      analysisConfidence: {
        transcriptUsed: hasTranscript,
        level: hasTranscript ? 'high' : 'low',
        limitations: hasTranscript
          ? ['No analytics data, so all retention statements are inference']
          : ['No transcript available', 'Hook, structure and pacing are inferred from title and description only'],
      },
    }

    return {
      text: JSON.stringify(analysis),
      inputTokens: Math.ceil(input.prompt.length / 4),
      outputTokens: 1400,
      model: this.model,
    }
  }

  async testConnection() {
    return { ok: true, message: 'Mock AI provider active — no ANTHROPIC_API_KEY required.' }
  }
}

/** Schema-valid weekly digest for MOCK_MODE, built from the prompt's own data. */
function mockDigest(prompt: string) {
  const channels = [...new Set([...prompt.matchAll(/- Channel: (.*)/g)].map((m) => m[1].trim()))]
  const titles = [...prompt.matchAll(/ {2}Title: (.*)/g)].map((m) => m[1].trim())
  const formats = [...prompt.matchAll(/Format: (\w+)/g)].map((m) => m[1])
  const topFormat = formats.sort((a, b) => formats.filter((f) => f === b).length - formats.filter((f) => f === a).length)[0]

  return {
    summary:
      `[Mock digest] ${titles.length} video${titles.length === 1 ? '' : 's'} were analysed across ` +
      `${channels.length} channel${channels.length === 1 ? '' : 's'} this week. ` +
      `The dominant format was ${topFormat ?? 'unclear'}, and most videos led with a concrete result rather than a promise. ` +
      `Titles clustered around first-person experiments and numbered breakdowns, which suggests the audience is currently ` +
      `rewarding proof over theory. Two videos embedded a product idea that looks buildable in under a month.`,
    whatChanged:
      'Compared with a typical week, more videos opened on a number rather than a backstory, and the case-study format ' +
      'displaced tutorials. That shift suggests creators in this niche are competing on credibility rather than teaching depth.',
    repeatedThemes: ['validation before building', 'pricing decisions', 'zero-budget distribution'],
    repeatedHooks: ['result reveal in the first ten seconds', 'admission of early failure', 'contrarian warning'],
    repeatedTitleStructures: ['I did [X] in [timeframe]', 'Stop doing [X]', '[N] things that [outcome]'],
    strongestOpportunityThemes: ['what to do when validation fails', 'pricing post-mortems', 'the unglamorous first version'],
    opportunities: [
      { title: 'The Validation That Failed: What I Learned From 400 Dead Ends', why: 'Nobody in this niche documents the failure path, and it serves the same audience at their most stuck moment.', format: 'case_study' },
      { title: 'I Priced The Same Product 4 Ways. Here Is What Happened.', why: 'Pricing regret is a widely shared pain and an easy experiment to run credibly.', format: 'case_study' },
      { title: 'The Embarrassing First Version Of 5 Profitable Products', why: 'Builds on the trust-through-transparency pattern that performed well this week.', format: 'listicle' },
      { title: 'Your Research Method Is The Weak Link — Fix It In 30 Minutes', why: 'Every video this week glossed over sourcing, which is the exact gap viewers ask about.', format: 'tutorial' },
      { title: 'Why I Stopped Adding Features (And Revenue Went Up)', why: 'Contrarian framing on a theme the audience already believes half of.', format: 'commentary' },
    ],
  }
}
