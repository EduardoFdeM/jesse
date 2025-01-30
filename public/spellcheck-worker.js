self.onmessage = async e => {
  const { text, lang } = e.data

  // Usa a API nativa do navegador para verificação ortográfica
  const words = text.split(/\s+/)
  let errors = 0

  try {
    // Configura o verificador ortográfico com o idioma correto
    if (
      self.languageChecker &&
      typeof self.languageChecker.setLanguage === 'function'
    ) {
      self.languageChecker.setLanguage(lang)
    }

    // Verifica cada palavra
    for (const word of words) {
      if (word && word.length > 1) {
        // Ignora caracteres únicos
        try {
          if (!(await self.languageChecker.check(word))) {
            errors++
          }
        } catch (err) {
          console.warn('Erro ao verificar palavra:', word, err)
        }
      }
    }
  } catch (error) {
    console.error('Erro na verificação ortográfica:', error)
  }

  self.postMessage({ errors })
}

// Inicializa o verificador ortográfico
try {
  self.languageChecker = new (self.Spellchecker || self.webkitSpellchecker)()
} catch (error) {
  console.warn('Verificador ortográfico não disponível:', error)
}
