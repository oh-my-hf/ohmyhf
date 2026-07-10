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

/** ISO 639-1 codes — the Hub indexes model/dataset languages as plain tags. */
export const LANGUAGES = [
  'en',
  'zh',
  'fr',
  'de',
  'es',
  'pt',
  'ru',
  'ja',
  'ko',
  'ar',
  'hi',
  'it',
  'nl',
  'pl',
  'tr',
  'vi',
  'th',
  'id',
  'sv',
  'fa',
  'he',
  'uk',
  'cs',
  'fi'
] as const

/** Serverless inference provider ids accepted by `?inference_provider=` (models only). */
export const PROVIDERS = [
  'groq',
  'novita',
  'cerebras',
  'nscale',
  'fal',
  'together',
  'fireworks-ai',
  'featherless-ai',
  'hyperbolic',
  'sambanova',
  'replicate',
  'cohere'
] as const

/** Misc model tags surfaced under "Other" on the Hub (raw `filter=` values). */
export const MODEL_OTHER_TAGS = [
  'gguf',
  'safetensors',
  'mlx',
  'onnx',
  'custom_code',
  'merge',
  'moe',
  'autotrain_compatible',
  'endpoints_compatible'
] as const

/** Dataset modalities; filtered as `modality:<value>` tags. */
export const DATASET_MODALITIES = [
  '3d',
  'audio',
  'document',
  'geospatial',
  'image',
  'tabular',
  'text',
  'timeseries',
  'video'
] as const

/**
 * Dataset row-count buckets. `tag` is the exact Hub tag string; the label is
 * translated (browse:datasetFilter.size.<labelKey>) because "<" in raw tags reads poorly.
 */
export const DATASET_SIZES = [
  { tag: 'size_categories:n<1K', labelKey: 'lt1k' },
  { tag: 'size_categories:1K<n<10K', labelKey: '1kTo10k' },
  { tag: 'size_categories:10K<n<100K', labelKey: '10kTo100k' },
  { tag: 'size_categories:100K<n<1M', labelKey: '100kTo1m' },
  { tag: 'size_categories:1M<n<10M', labelKey: '1mTo10m' },
  { tag: 'size_categories:10M<n<100M', labelKey: '10mTo100m' },
  { tag: 'size_categories:100M<n<1B', labelKey: '100mTo1b' },
  { tag: 'size_categories:n>1T', labelKey: 'gt1t' }
] as const

/** Dataset file formats; filtered as `format:<value>` tags. */
export const DATASET_FORMATS = [
  'json',
  'csv',
  'parquet',
  'imagefolder',
  'soundfolder',
  'webdataset',
  'text',
  'arrow'
] as const

/** Space SDKs; the sdk is indexed as a plain tag on the Hub. */
export const SPACE_SDKS = ['gradio', 'streamlit', 'docker', 'static'] as const
