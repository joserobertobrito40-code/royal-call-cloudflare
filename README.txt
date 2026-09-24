ROYAL CALL — SALA DE INGLÊS COM ROBERTO

O que este projeto faz
- 1 professor + 1 aluno
- Aprovação do aluno pelo professor
- Câmera e microfone com WebRTC
- Cloudflare TURN para redes que bloqueiam conexão direta
- Cloudflare Durable Objects como sinalização em tempo real
- Link exclusivo para o aluno
- Botões de câmera e microfone
- Área de lição e comentários locais

IMPORTANTE
O Worker antigo "royal-call-turn" apenas gera credenciais TURN. Para professor e aluno se enxergarem em aparelhos/redes diferentes, também é necessário um canal de sinalização. Este projeto inclui esse canal usando Durable Objects.

ARQUIVOS
- public/index.html   -> interface da sala
- src/worker.js      -> TURN + sinalização WebSocket
- wrangler.jsonc     -> configuração Cloudflare

SEGREDOS NECESSÁRIOS
No Worker, configure:
TURN_KEY_ID
TURN_API_TOKEN

Eles são os mesmos que você já criou na Cloudflare.

DEPLOY RECOMENDADO (Cloudflare Wrangler)
1. Instale Node.js LTS no computador.
2. Abra Terminal/Prompt dentro desta pasta.
3. Rode: npm install -g wrangler
4. Rode: wrangler login
5. Rode: wrangler secret put TURN_KEY_ID
   Cole o TURN Token ID quando pedir.
6. Rode: wrangler secret put TURN_API_TOKEN
   Cole o API Token quando pedir.
7. Rode: wrangler deploy

Na primeira implantação o Cloudflare criará a classe Durable Object "Room" por causa da migration v1.

COMO TESTAR
1. Abra o endereço publicado.
2. Clique em "Criar sala de aula".
3. Permita câmera e microfone.
4. Copie o link do aluno.
5. Abra esse link em outro aparelho ou envie para o aluno.
6. O professor verá "Aluno solicitou entrada".
7. Clique em "Permitir entrada".
8. A chamada WebRTC será negociada automaticamente.

SEGURANÇA
- O link do professor contém um parâmetro host secreto. Não envie esse link ao aluno.
- O link exibido em "Link do aluno" remove o host secreto.
- As credenciais TURN são temporárias e não ficam gravadas no HTML.
- O TURN_API_TOKEN fica apenas nos Secrets do Worker.

OBSERVAÇÃO
A área de lição compartilhada e os comentários nesta versão são locais. O foco desta versão é resolver câmera/microfone e a conexão professor-aluno. Depois que o vídeo estiver confirmado, podemos sincronizar lição e comentários pelo mesmo Durable Object.
