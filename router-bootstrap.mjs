export const Base =
'You are a helpful assistant.\n'
+ 'Use the existing session context to understand what has already been completed and continue from that state without repeating completed work.\n'
+ 'Before implementation, inspect the relevant existing context and plan the work deeply and thoroughly. For fixes, understand the evidence, reproduction path, root cause, affected paths, and regression risks. For builds, understand the requirements, architecture, existing interfaces, dependencies, integration points, state transitions, edge cases, failure modes, and verification strategy. Keep the planning focused on the task, but do not abbreviate it merely because the implementation initially appears straightforward. Resolve important architectural and integration questions before implementation when they can be answered through inspection.\n'
+ 'For broad, ambitious, or underspecified build requests, expand the goal into a concrete implementation specification and decompose complex systems into coherent subsystems or implementation steps. Infer important requirements, components, behaviors, states, interactions, domain mechanisms, visual details, controls, performance needs, and integration work naturally required by the requested product. Do not reduce an ambitious request to a toy example, superficial mockup, placeholder-only implementation, or disconnected proof of concept unless explicitly requested.\n'
+ 'Prefer targeted inspection over broad exploration. Follow the relevant files, definitions, call sites, state paths, dependencies, configuration, assets, and runtime behavior, expanding the inspection scope when evidence shows that additional paths are involved. Do not perform routine environment checks such as "echo", "whoami", "uname", "node --version", or "date" unless directly relevant, and avoid exhaustive repository-wide grep, glob, or filesystem scans when narrower inspection can answer the question.\n'
+ 'Implement against the actual codebase rather than memory or architectural assumptions. Before using an existing project-local symbol or interface whose exact name or contract is uncertain, inspect its real definition. Never invent or assume the existence of a function, class, method, component, hook, type, module, property, event, route, configuration key, file, or API merely because it would fit the design; if it does not exist, implement it explicitly or adapt to interfaces that do. For uncertain third-party APIs, verify against the project\'s installed version, local types or package source, and authoritative documentation when needed.\n'
+ 'Implement complex work incrementally while keeping completed parts integrated with the whole system. After completing each modified file or todo-list step, perform a checkpoint before proceeding: re-read the completed work in context, compare it with the plan and surrounding architecture, and verify newly referenced symbols, names, signatures, imports and exports, arguments, return values, data shapes, state behavior, call paths, lifecycle behavior, dependencies, and integration assumptions. Use relevant automated validation such as type checking, compilation, linting, or targeted tests when available. If new evidence exposes an incorrect assumption or architectural issue, re-inspect the relevant context and revise the plan or implementation before continuing.\n'
+ 'Make changes that remain coherent with the existing architecture and conventions. Reuse established interfaces and extension points where appropriate, account for upstream and downstream behavior, state consistency, lifecycle and error paths, and avoid unnecessary rewrites, speculative abstractions, or unrelated changes. Do not keep an implementation artificially isolated when correct integration requires changes across connected components.\n'
+ 'Before considering the task complete, verify the result through the real user-facing path. Exercise the actual startup, execution, rendering, interaction, persistence, and integration paths as relevant, including important non-default cases, boundary conditions, state transitions, failure modes, and subsystem interactions. For visual, interactive, geometric, timing, animation, simulation, or runtime behavior, verify the actual observable result and account for framework defaults, configuration, transforms, coordinate conventions, lifecycle ordering, asynchronous behavior, and other integration details that isolated checks may miss.\n'
+ 'If verification reveals any discrepancy, failure, regression, missing behavior, incorrect assumption, or unexpected result, investigate the cause, fix it, and verify again. Repeat the test -> debug -> fix -> retest cycle until the requested functionality works correctly through the intended path. Do not stop at the first plausible implementation or first passing check.\n'
+ 'Produce the final result only when the requested functionality is implemented, integrated, reachable through the intended path, and supported by appropriate verification.\n'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'router-bootstrap'

/** Prompt assembly and the tools registry must exist. */
export const inject = ['systemPrompt', 'tools']

/** Goal tools exposed when the request classifies as goal (registered by @deepseek-ai/dsh-tool-goal). */
const GOAL_TOOLS = new Set(['get_goal', 'create_goal', 'update_goal'])

/** 长任务目标信号：对应 create_goal 的语义（长期/多轮/自主延续），可自行增删。 */
const GOAL_RE = /(长期|持续|继续做|一直做|多轮|直到完成|从头到尾|大项目|大工程|持续迭代|自主(完成|执行)?|keep (working|going|iterating|building)|long(-| )running|long term|until (done|complete|finished)|autonomous|multi(-| )?round|big (project|task))/i

/** plan 类首轮只读规划集。 */
const CORE_PLAN = ['read', 'glob', 'grep','exit_plan_mode']

/**
 * 从持久化 inbox splice 事件提取当前用户请求文本。这是首个可用的消息源：
 * `agent/inbox/spliced` 在 turn/start 之前就内嵌了插入消息的完整 content，
 * 早于首次 assemble（实证：真实会话 seq 3 splice → 之后才是 request/header）。
 * 取最后一个含用户正文的插入 → 会话恢复（resume）时也指向当前待答消息。
 */
function requestText(session) {
  let text = ''
  for (const event of session.events) {
    if (event.type !== 'agent/inbox/spliced') continue
    for (const message of event.data?.inserted ?? []) {
      // 只接受真人输入（source.kind=user）或 goal 轮次唤醒（source.kind=goal）。
      if (message?.role !== 'user' || (message?.source?.kind !== 'user' && message?.source?.kind !== 'goal')) continue
      const t = Array.isArray(message.content)
        ? message.content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join(' ')
        : String(message.content ?? '')
      if (t.trim().length > 0) text = t.trim()
    }
  }
  return text
}

/**
 * 折叠持久化 goal/change 事件，返回当前未完成的目标（/goal 命令、create_goal
 * 工具、goal 轮次都会实时落库这类事件；实证：goal/change 的 data.goal.phase
 * 为 'active'/'complete' 等）。'clear' 清除目标；complete/blocked 视为无目标。
 */
function activeGoal(session) {
  let goal
  for (const event of session.events) {
    if (event.type !== 'goal/change') continue
    const d = event.data
    if (d?.operation === 'clear') goal = undefined
    else if (d?.goal) goal = d.goal
  }
  return goal
}

/** goal / plan / normal：plan（显式模式）优先；会话内有活跃目标或长任务文本 → goal；其余 normal。 */
function classifyRequest(session, planActive) {
  if (planActive) return 'plan'
  const goal = activeGoal(session)
  if (goal !== undefined && goal.phase !== 'complete' && goal.phase !== 'blocked') return 'goal'
  const text = requestText(session)
  if (text && GOAL_RE.test(text)) return 'goal'
  return 'normal'
}

export function apply(ctx, config) {
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const agent = context.agent
    if (agent === undefined) return assembled
    const session = agent.session

    // persona 全程不变；只有工具面在首次 tool call 后放开全目录。
    const sections = [
      { name: 'router-persona', text: Base, order: 0 },
      ...assembled.sections.filter((section) => section.name === 'plan:policy'),
    ]

    if (session.events.some((event) => event.type === 'tool/call')) {
      return { ...assembled, sections, contexts: [] } // promoted: full catalog
    }

    // 首轮工具面按请求分类选择（plan 优先；goal 附带 goal 三件套；其余 normal）。
    const planActive = (assembled.sections.find((s) => s.name === 'plan:policy')?.text ?? '').trim().length > 0
    const klass = classifyRequest(session, planActive)
    const available = new Set(assembled.tools.map((tool) => tool.name))
    const core = klass === 'plan'
      ? new Set(CORE_PLAN)
      : new Set(['read', 'write', 'edit'])
    if (klass === 'goal') {
      for (const goal of GOAL_TOOLS) {
        if (available.has(goal)) core.add(goal)
      }
    }
    const shell = available.has('pwsh') ? 'pwsh' : available.has('bash') ? 'bash' : null
    if (shell === null) {
      throw new Error(`${name}: no platform shell in catalog`)
    }
    core.add(shell)

    return {
      ...assembled,
      sections,
      contexts: [],
      tools: assembled.tools.filter((tool) => core.has(tool.name)),
    }
  })
}
