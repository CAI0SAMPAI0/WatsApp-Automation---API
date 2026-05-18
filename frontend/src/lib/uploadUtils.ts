import { supabase } from '@/lib/supabase'
import { MessageFile } from '@/types'

/**
 * Sanitiza o nome do arquivo para uso seguro como chave no Supabase Storage.
 * Remove/substitui caracteres que quebram a URL ou a chave do bucket:
 * espaços, parênteses, vírgulas, acentos, caracteres especiais.
 */
export const sanitizeFileName = (name: string): string => {
  // Separa extensão do nome base
  const lastDot = name.lastIndexOf('.')
  const ext = lastDot !== -1 ? name.slice(lastDot) : ''
  const base = lastDot !== -1 ? name.slice(0, lastDot) : name

  return (
    base
      // Normaliza unicode (decompõe acentos) e remove os diacríticos
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Substitui espaços por hífen
      .replace(/\s+/g, '-')
      // Remove qualquer caractere que não seja letra, número, hífen ou underscore
      .replace(/[^a-zA-Z0-9_-]/g, '')
      // Evita hífens duplicados
      .replace(/-{2,}/g, '-')
      // Remove hífens no início/fim
      .replace(/^-+|-+$/g, '')
      // Limita o tamanho do nome base a 80 chars para evitar chaves gigantes
      .slice(0, 80) + ext.toLowerCase()
  )
}

export const getFileType = (file: File): string => {
  const mime = file.type
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime.includes('pdf')) return 'pdf'
  if (ext === 'pptx' || ext === 'ppt') return 'pptx'
  if (ext === 'docx' || ext === 'doc') return 'docx'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  return 'document'
}

export const uploadFile = async (file: File): Promise<MessageFile> => {
  const safeName = sanitizeFileName(file.name)
  const path = `uploads/${Date.now()}-${safeName}`

  const { error } = await supabase.storage
    .from('message-files')
    .upload(path, file, { contentType: file.type })

  if (error) throw new Error('Erro ao fazer upload: ' + error.message)

  const { data } = supabase.storage.from('message-files').getPublicUrl(path)
  // Guarda o nome original para exibir na interface/WhatsApp
  return { url: data.publicUrl, type: getFileType(file), name: file.name }
}