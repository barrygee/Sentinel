import { test } from '@playwright/test'
import { installDefaultMocks } from './support/mockApi'

test('diagnose sdr radios', async ({ page }) => {
  const log: string[] = []
  page.on('request', (request) => {
    const url = request.url().replace('http://localhost:4173', '')
    if (url.startsWith('/api/sdr') || url.startsWith('/ws'))
      log.push(`req ${request.method()} ${url}`)
  })
  page.on('response', (response) => {
    const url = response.url().replace('http://localhost:4173', '')
    if (url.startsWith('/api/sdr/radios')) log.push(`res ${response.status()} ${url}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') log.push(`console: ${message.text().slice(0, 300)}`)
  })
  page.on('pageerror', (error) => log.push(`pageerror: ${error.message}`))
  await installDefaultMocks(page)
  await page.goto('/sdr/')
  await page.waitForTimeout(5000)
  log.push('dropdown: ' + (await page.locator('.sdr-device-dropdown-text').first().textContent()))
  console.log(log.join('\n'))
})
