// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import BlogFooter from '../src/BlogFooter'
import Layout from '../src/Layout'
import PreferredSourceCta from '../src/ui/PreferredSourceCta'

const EXPECTED_HREF = 'https://www.google.com/preferences/source?q=https%3A%2F%2Fagentmarkup.dev&hl=en'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function renderMarkup(element: React.ReactElement) {
  const container = document.createElement('div')
  container.innerHTML = renderToString(element)
  return container
}

function expectNoSeoBaselineLandmarks(container: HTMLElement) {
  expect(container.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull()
  expect(container.querySelector('section[id]')).toBeNull()
  expect(container.querySelector('a[href^="/"]')).toBeNull()
}

function getVisibleText(element: HTMLElement | null) {
  const clone = element?.cloneNode(true) as HTMLElement | undefined
  clone?.querySelectorAll('.sr-only, [aria-hidden="true"]').forEach((node) => node.remove())
  return clone?.textContent?.trim()
}

function clickWithoutNavigation(link: HTMLAnchorElement | null) {
  link?.addEventListener('click', (event) => event.preventDefault(), { once: true })
  link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

function auxClickWithoutNavigation(link: HTMLAnchorElement | null, button: number) {
  link?.addEventListener('auxclick', (event) => event.preventDefault(), { once: true })
  link?.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button, cancelable: true }))
}

describe('PreferredSourceCta', () => {
  it('renders the footer variant as a secure external Google deeplink', () => {
    const container = renderMarkup(createElement(PreferredSourceCta, { variant: 'footer' }))
    const link = container.querySelector<HTMLAnchorElement>('.preferred-source-link')

    expect(link?.getAttribute('href')).toBe(EXPECTED_HREF)
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    expect(getVisibleText(link)).toBe('Prefer us on Google')
    expect(link?.querySelector('.sr-only')?.textContent).toContain('(opens in a new tab)')
    expect(link?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expectNoSeoBaselineLandmarks(container)
  })

  it('renders the article variant as one prompt paragraph in a labelled aside', () => {
    const container = renderMarkup(createElement(PreferredSourceCta, { variant: 'article' }))
    const aside = container.querySelector<HTMLElement>('aside.preferred-source-cta')

    expect(aside?.getAttribute('aria-label')).toBe('Prefer agentmarkup on Google')
    expect(aside?.querySelectorAll(':scope > p')).toHaveLength(1)
    expect(aside?.querySelector(':scope > p')?.textContent).toBe('Choose agentmarkup as a preferred source for your own Google Top stories results.')
    const link = aside?.querySelector<HTMLAnchorElement>('.preferred-source-button') ?? null
    expect(link?.getAttribute('href')).toBe(EXPECTED_HREF)
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    expect(getVisibleText(link)).toBe('Prefer us on Google')
    expect(link?.querySelector('.sr-only')?.textContent).toContain('(opens in a new tab)')
    expectNoSeoBaselineLandmarks(container)
  })

  it('does not define or call gtag when Google Analytics is not loaded', () => {
    Reflect.deleteProperty(window, 'gtag')
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => root.render(createElement(PreferredSourceCta, { variant: 'footer' })))
    expect(window.gtag).toBeUndefined()
    const link = container.querySelector<HTMLAnchorElement>('a')
    expect(() => act(() => clickWithoutNavigation(link))).not.toThrow()
    expect(() => act(() => auxClickWithoutNavigation(link, 1))).not.toThrow()
    expect(window.gtag).toBeUndefined()
    act(() => root.unmount())
  })

  it('reports the selected variant when consented Google Analytics is loaded', () => {
    const gtag = vi.fn()
    window.gtag = gtag
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => root.render(createElement(PreferredSourceCta, { variant: 'article' })))
    act(() => clickWithoutNavigation(container.querySelector<HTMLAnchorElement>('a')))

    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith('event', 'click_preferred_source', { variant: 'article' })
    act(() => root.unmount())
    Reflect.deleteProperty(window, 'gtag')
  })

  it('reports footer middle-click opens but ignores right-clicks', () => {
    const gtag = vi.fn()
    window.gtag = gtag
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => root.render(createElement(PreferredSourceCta, { variant: 'footer' })))
    const link = container.querySelector<HTMLAnchorElement>('a')
    act(() => auxClickWithoutNavigation(link, 1))
    act(() => auxClickWithoutNavigation(link, 2))

    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith('event', 'click_preferred_source', { variant: 'footer' })
    act(() => root.unmount())
    Reflect.deleteProperty(window, 'gtag')
  })

  it.each(['footer', 'article'] as const)('hydrates the %s variant without recoverable errors', async (variant) => {
    const element = createElement(PreferredSourceCta, { variant })
    const container = document.createElement('div')
    container.innerHTML = renderToString(element)
    const onRecoverableError = vi.fn()
    const root = hydrateRoot(container, element, { onRecoverableError })

    await act(async () => {
      for (let index = 0; index < 24; index += 1) await Promise.resolve()
    })

    expect(onRecoverableError).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })
})

describe('PreferredSourceCta integration', () => {
  it('renders exactly one article CTA through BlogFooter', () => {
    const markup = renderToString(createElement(BlogFooter, { currentSlug: 'why-llms-txt-matters' }))

    expect(markup.split('preferences/source').length - 1).toBe(1)
  })

  it('renders exactly one footer CTA through Layout', () => {
    const markup = renderToString(createElement(Layout, { children: createElement('main', null, 'Test page') }))

    expect(markup.split('preferences/source').length - 1).toBe(1)
    expect(markup).toContain('<a class="preferred-source-link"')
  })
})
