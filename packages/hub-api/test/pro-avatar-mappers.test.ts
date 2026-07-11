import { describe, expect, it } from 'vitest'
import { mapActivityFeed, mapPost } from '../src'

describe('mapPost authorIsPro', () => {
  it('maps author.isPro true', () => {
    const post = mapPost(
      { slug: '1', author: { name: 'a', isPro: true }, rawContent: '', url: '/posts/a/1' },
      'https://huggingface.co'
    )
    expect(post.authorIsPro).toBe(true)
  })

  it('maps author.isPro false', () => {
    const post = mapPost(
      { slug: '1', author: { name: 'a', isPro: false }, rawContent: '', url: '/posts/a/1' },
      'https://huggingface.co'
    )
    expect(post.authorIsPro).toBe(false)
  })

  it('omits authorIsPro when missing', () => {
    const post = mapPost(
      { slug: '1', author: { name: 'a' }, rawContent: '', url: '/posts/a/1' },
      'https://huggingface.co'
    )
    expect(post.authorIsPro).toBeUndefined()
  })
})

describe('mapActivityFeed actorIsPro', () => {
  it('maps top-level isPro on like items', () => {
    const feed = mapActivityFeed(
      {
        recentActivity: [
          {
            type: 'like',
            user: 'prouser',
            userAvatarUrl: '/avatar.png',
            isPro: true,
            repoType: 'model',
            repoData: { id: 'prouser/m', author: 'prouser' }
          }
        ]
      },
      'https://huggingface.co'
    )
    expect(feed.items[0]).toMatchObject({ kind: 'like', actor: 'prouser', actorIsPro: true })
  })

  it('leaves actorIsPro undefined when omitted', () => {
    const feed = mapActivityFeed(
      {
        recentActivity: [
          {
            type: 'like',
            user: 'u',
            repoType: 'model',
            repoData: { id: 'u/m', author: 'u' }
          }
        ]
      },
      'https://huggingface.co'
    )
    expect(feed.items[0]).toMatchObject({ kind: 'like', actor: 'u' })
    expect((feed.items[0] as { actorIsPro?: boolean }).actorIsPro).toBeUndefined()
  })
})
