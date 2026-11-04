/** Logos and images: one row per slot, uploads on choosing a file, and removes. */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { removeBrandAsset, uploadBrandAsset } from '@/actions/admin/brand-assets'
import { BrandImagesSection } from '@/components/admin/settings/appearance/brand-images-section'

jest.mock('@/actions/admin/brand-assets', () => ({ uploadBrandAsset: jest.fn(), removeBrandAsset: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

beforeEach(() => jest.clearAllMocks())

it('lists every slot, with a preview only where an image is uploaded', () => {
  render(<BrandImagesSection assets={{ icon: '/api/branding/icon?v=abc' }} />)
  for (const kind of ['wordmark', 'icon', 'favicon', 'login-background']) {
    expect(screen.getByTestId(`brand-image-${kind}`)).toBeInTheDocument()
  }
  expect(screen.getByTestId('brand-image-icon-preview')).toHaveAttribute('src', '/api/branding/icon?v=abc')
  expect(screen.getByTestId('brand-image-icon-upload')).toHaveTextContent('Replace')
  expect(screen.queryByTestId('brand-image-wordmark-preview')).not.toBeInTheDocument()
  expect(screen.queryByTestId('brand-image-wordmark-remove')).not.toBeInTheDocument()
})

it('uploads a chosen file to its slot', async () => {
  const user = userEvent.setup()
  jest.mocked(uploadBrandAsset).mockResolvedValue({ success: true, data: { kind: 'wordmark', url: '/x' } })
  render(<BrandImagesSection assets={{}} />)

  const file = new File(['png'], 'logo.png', { type: 'image/png' })
  await user.upload(screen.getByTestId('brand-image-wordmark-input'), file)

  await waitFor(() => expect(uploadBrandAsset).toHaveBeenCalledWith({ kind: 'wordmark', file }))
  expect(mockShowSuccess).toHaveBeenCalledWith('Logo (wordmark) uploaded')
})

it('toasts a refused upload', async () => {
  const user = userEvent.setup()
  jest.mocked(uploadBrandAsset).mockResolvedValue({ success: false, code: 'VALIDATION', error: 'Favicon must be a PNG, JPEG or SVG image' })
  render(<BrandImagesSection assets={{}} />)

  await user.upload(screen.getByTestId('brand-image-favicon-input'), new File(['x'], 'f.png', { type: 'image/png' }))
  await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Favicon must be a PNG, JPEG or SVG image'))
})

it('refuses a file over the limit before it uploads', async () => {
  const user = userEvent.setup()
  render(<BrandImagesSection assets={{}} />)

  const big = new File([new Uint8Array(800 * 1024)], 'big.png', { type: 'image/png' })
  await user.upload(screen.getByTestId('brand-image-icon-input'), big)
  await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Images can be at most 768 KB'))
  expect(uploadBrandAsset).not.toHaveBeenCalled()
})

it('removes an uploaded image', async () => {
  const user = userEvent.setup()
  jest.mocked(removeBrandAsset).mockResolvedValue({ success: true, data: { kind: 'icon' } })
  render(<BrandImagesSection assets={{ icon: '/api/branding/icon?v=abc' }} />)

  await user.click(screen.getByTestId('brand-image-icon-remove'))
  await waitFor(() => expect(removeBrandAsset).toHaveBeenCalledWith('icon'))
  expect(mockShowSuccess).toHaveBeenCalledWith('Logo (icon) removed')
})
