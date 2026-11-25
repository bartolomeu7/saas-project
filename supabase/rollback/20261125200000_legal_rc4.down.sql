-- =============================================================================
-- Volta de 20261125200000_legal_rc4: documentos legais SÓ ANDAM PARA FRENTE.
-- Este arquivo NÃO desfaz nada, de propósito: versão publicada não pode ser apagada nem sair de "retired"
-- (gatilho legal_document_versions_guard_trigger), e aposentar a rc.4 deixaria o sistema sem documento vigente.
--
-- Se algo der errado depois da publicação:
--  1) Preferido: corrigir o código e publicar de novo, mantendo a rc.4. Para mudar o texto, publicar uma rc.5 em
--     nova migration.
--  2) Emergência (o site voltou ao código antigo, rc.3, e ninguém consegue aceitar os documentos): publicar o
--     código novo o quanto antes. Reativar a rc.3 exigiria desligar o gatilho de imutabilidade como superusuário;
--     isso apaga a garantia de prova dos aceites e só deve ser feito com decisão explícita do responsável.
-- =============================================================================
do $$
begin
  raise exception 'Documentos legais não têm volta automática. Leia os comentários deste arquivo.';
end $$;
