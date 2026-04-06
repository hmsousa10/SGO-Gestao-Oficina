# Programação Web - Oficina

Projeto desenvolvido na disciplina de **Programação Web**, utilizando **Java**, **JavaScript**, **HTML** e **CSS**.

## 🔧 Tecnologias utilizadas

- **Java** – lógica de negócio / backend  
- **JavaScript** – interação no lado do cliente  
- **HTML** – estrutura das páginas  
- **CSS** – estilos e layout  

## 🚀 Requisitos para executar

Antes de começar, o utilizador precisa de ter instalado:

- [Git](https://git-scm.com/)
- [Visual Studio Code](https://code.visualstudio.com/) (ou outro editor/IDE)
- **JDK** (Java Development Kit) – recomendado: JDK 17 ou superior
- Extensão Java no VS Code (opcional mas recomendado)
- Extensão **Live Server** (opcional, para testar o front‑end)

## 📥 Como clonar o repositório

```bash
git clone https://github.com/hmsousa10/Programacao_web_Oficina-main.git
cd Programacao_web_Oficina-main
```

Ou, no VS Code:

1. `Ctrl + Shift + P` → `Git: Clone`
2. Colar o URL do repositório
3. Escolher a pasta de destino
4. Abrir a pasta no VS Code

## ▶️ Como executar o projeto

### 1. Atualizar o código

Antes de começar a trabalhar:

```bash
git pull origin main
```

ou usar o botão **Pull** no VS Code.

### 2. Correr a parte Java

1. Abrir o projeto no VS Code (ou outra IDE).
2. Certificar que o JDK está configurado.
3. Procurar a classe com o método `main` (por exemplo `Main.java`).
4. Clicar em **Run** / **Executar** ou usar o comando da IDE para correr a aplicação.

> Caso o projeto use Maven/Gradle, ajustar aqui para:
> - `mvn spring-boot:run` / `mvn exec:java`
> - ou `gradle bootRun` / `gradle run`

### 3. Correr a parte Web (HTML/CSS/JS)

Opção simples:

- Abrir o ficheiro principal (ex.: `index.html`) no navegador.

Opção com Live Server (VS Code):

1. Instalar a extensão **Live Server**.
2. Clicar com o botão direito em `index.html` → **Open with Live Server**.
3. O site abre no browser em `http://localhost:5500` (ou porta semelhante).

## 👥 Colaboração (colegas)

Para os colegas trabalharem neste repositório:

1. O dono do repositório adiciona os colegas como **Collaborators** no GitHub.
2. Os colegas aceitam o convite.
3. Cada colega:
   - Faz **clone** do repositório.
   - Antes de trabalhar, faz `git pull`.
   - Depois de fazer alterações:

   ```bash
   git add .
   git commit -m "mensagem do commit"
   git push origin main
   ```

   ou usa a aba **Source Control** do VS Code (stage → commit → push).

## 📁 Estrutura (exemplo)

> Ajustar à estrutura real do projeto.

```text
Programacao_web_Oficina-main/
├─ src/                # Código Java
├─ web/                # Ficheiros HTML, CSS, JS
├─ README.md           # Este ficheiro
└─ ...
```

## 📄 Licença

Projeto para fins académicos/oficina.  
Usar e modificar livremente para estudo.