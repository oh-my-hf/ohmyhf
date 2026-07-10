import {
  AlignLeft,
  AudioLines,
  Binary,
  Bot,
  Cpu,
  Equal,
  Image,
  ImagePlus,
  Images,
  Languages,
  MessageCircleQuestion,
  Mic,
  ScanSearch,
  ScanText,
  Shapes,
  Tag,
  Tags,
  Type,
  Video,
  Volume2,
  type LucideIcon
} from 'lucide-react'

/**
 * HF task-tag category hues. huggingface.co colors the leading icon tile of a
 * task tag by modality (the exact label↔color table is Hub-internal data; this
 * mapping mirrors the observable site: text-generation=red, NLP=indigo,
 * vision=yellow, audio=green, multimodal=blue, RL/robotics=purple).
 */
export type TagHue = 'blue' | 'green' | 'indigo' | 'orange' | 'purple' | 'red' | 'yellow'

export const TAG_HUE_VAR: Record<TagHue, string> = {
  blue: 'var(--c-tag-blue)',
  green: 'var(--c-tag-green)',
  indigo: 'var(--c-tag-indigo)',
  orange: 'var(--c-tag-orange)',
  purple: 'var(--c-tag-purple)',
  red: 'var(--c-tag-red)',
  yellow: 'var(--c-tag-yellow)'
}

const TASK_HUE: Record<string, TagHue> = {
  'text-generation': 'red',
  'text-classification': 'indigo',
  'token-classification': 'indigo',
  'question-answering': 'indigo',
  summarization: 'indigo',
  translation: 'indigo',
  'fill-mask': 'indigo',
  'sentence-similarity': 'indigo',
  'feature-extraction': 'indigo',
  'zero-shot-classification': 'indigo',
  'text-to-image': 'yellow',
  'image-to-image': 'yellow',
  'image-classification': 'yellow',
  'object-detection': 'yellow',
  'image-segmentation': 'yellow',
  'text-to-speech': 'green',
  'automatic-speech-recognition': 'green',
  'audio-classification': 'green',
  'image-to-text': 'blue',
  'text-to-video': 'blue',
  'reinforcement-learning': 'purple',
  robotics: 'purple'
}

export function taskHue(pipelineTag: string): TagHue {
  return TASK_HUE[pipelineTag] ?? 'orange'
}

const TASK_ICON: Record<string, LucideIcon> = {
  'text-generation': Type,
  'text-classification': Tags,
  'token-classification': Tags,
  'question-answering': MessageCircleQuestion,
  summarization: AlignLeft,
  translation: Languages,
  'fill-mask': Type,
  'sentence-similarity': Equal,
  'feature-extraction': Binary,
  'zero-shot-classification': Tags,
  'text-to-image': ImagePlus,
  'image-to-text': ScanText,
  'image-to-image': Images,
  'image-classification': Image,
  'object-detection': ScanSearch,
  'image-segmentation': Shapes,
  'text-to-speech': Volume2,
  'automatic-speech-recognition': Mic,
  'audio-classification': AudioLines,
  'text-to-video': Video,
  'reinforcement-learning': Bot,
  robotics: Cpu
}

export function taskIcon(pipelineTag: string): LucideIcon {
  return TASK_ICON[pipelineTag] ?? Tag
}
