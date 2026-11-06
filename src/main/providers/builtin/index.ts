/**
 * 内置供应商注册表（slim：deepseek / glm / minimax 三家网页端 + 一个通用 OpenAI 兼容上游）
 * 上游：Chat2API src/main/providers/builtin/index.ts
 */
import deepseekConfig from './deepseek.ts'
import glmConfig from './glm.ts'
import minimaxConfig from './minimax.ts'
import openaiConfig from './openai.ts'
import type { BuiltinProviderConfig } from '../../store/types.ts'

export const builtinProviders: BuiltinProviderConfig[] = [
  deepseekConfig,
  glmConfig,
  minimaxConfig,
  openaiConfig,
]

export const builtinProviderMap: Record<string, BuiltinProviderConfig> = {
  deepseek: deepseekConfig,
  glm: glmConfig,
  minimax: minimaxConfig,
  openai: openaiConfig,
}

export function getBuiltinProvider(id: string): BuiltinProviderConfig | undefined {
  return builtinProviderMap[id]
}

export function getBuiltinProviders(): BuiltinProviderConfig[] {
  return builtinProviders
}

export { deepseekConfig, glmConfig, minimaxConfig, openaiConfig }

export default builtinProviders
