/**
 * Curated filter values. These are Hub API identifiers rendered verbatim
 * (they are not translatable copy).
 */
export const TASKS = [
  'text-generation',
  'text-classification',
  'token-classification',
  'question-answering',
  'summarization',
  'translation',
  'fill-mask',
  'sentence-similarity',
  'feature-extraction',
  'text-to-image',
  'image-to-text',
  'image-to-image',
  'image-classification',
  'object-detection',
  'image-segmentation',
  'text-to-speech',
  'automatic-speech-recognition',
  'audio-classification',
  'text-to-video',
  'zero-shot-classification',
  'reinforcement-learning',
  'robotics'
] as const

export const LIBRARIES = [
  'transformers',
  'diffusers',
  'sentence-transformers',
  'gguf',
  'mlx',
  'onnx',
  'safetensors',
  'peft',
  'timm',
  'keras',
  'spacy',
  'fastai'
] as const

export const LICENSES = [
  'apache-2.0',
  'mit',
  'openrail',
  'creativeml-openrail-m',
  'cc-by-4.0',
  'cc-by-sa-4.0',
  'cc-by-nc-4.0',
  'llama3',
  'llama3.1',
  'gemma',
  'bsd-3-clause',
  'gpl-3.0',
  'agpl-3.0',
  'other'
] as const

export const PARAM_BUCKETS = ['lt1b', '1to7b', '7to30b', 'gt30b'] as const
