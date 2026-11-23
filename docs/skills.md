# Skills & quy trình làm việc

Repo đã cài sẵn các bộ skill cho agent, theo hướng **contract-first** và
**interview-first**: làm rõ yêu cầu trước khi lập plan và viết code.

## 1. Đã cài gì

| Bộ skill | Vị trí | Trạng thái |
| --- | --- | --- |
| **Superpowers** | `opencode.json` → `plugins` | Plugin tự load khi mở project |
| **Matt Pocock skills** (engineering + productivity) | `.agents/skills/*/SKILL.md` | 27 skill, license MIT |
| **OfficeCLI** | `.agents/skills/officecli/SKILL.md` | Skill có sẵn; binary `officecli` chưa cài |

Nguồn:

- Matt Pocock: <https://github.com/mattpocock/skills>, commit
  `abeeaf95660ba9e8b7c753eb38f441ca707a8823` (2026-11-21).
  Metadata: `.agents/skills/mattpocock/SOURCE.md`.
- Superpowers: <https://github.com/obra/superpowers>.
- OfficeCLI: <https://officecli.ai/SKILL.md> / <https://github.com/iOfficeAI/OfficeCLI>.

## 2. Lệnh chính

Các skill **user-invoked** có slash command tương ứng trong `.opencode/commands/`:

| Lệnh | Khi dùng |
| --- | --- |
| `/setup-matt-pocock-skills` | Chạy **một lần** cho repo: chọn issue tracker, triage labels, nơi lưu domain docs |
| `/grill-me` | Agent phỏng vấn làm rõ plan/design, không ghi docs |
| `/grill-with-docs` | Như `/grill-me` + cập nhật `GLOSSARY.md` và ADR trong lúc phỏng vấn |
| `/ask-matt` | Hỏi nên dùng skill/quy trình nào cho tình huống hiện tại |
| `/to-spec` | Tổng hợp hội thoại thành spec |
| `/to-tickets` | Chia spec/plan thành ticket có thứ tự blocking |
| `/implement` | Triển khai spec/ticket theo TDD |
| `/implement-spec` | Triển khai toàn bộ spec trên một nhánh |
| `/triage` | Phân loại issue theo trạng thái |
| `/wayfinder` | Chia việc quá lớn cho một session thành bản đồ quyết định |
| `/handoff` | Tóm tắt hội thoại để agent khác tiếp tục |
| `/retro` | Gợi ý cải thiện môi trường làm việc của agent |
| `/teach` | Học một khái niệm/kỹ năng qua nhiều session |
| `/to-questionnaire` | Biến quyết định cần người khác trả lời thành questionnaire |
| `/wait-what` | Yêu cầu agent giải thích lại khi chưa hiểu |

Các skill **model-invoked** được agent tự gọi khi phù hợp (không cần slash command):
`grilling`, `tdd`, `diagnosing-bugs`, `code-review`, `domain-modeling`,
`codebase-design`, `research`, `prototype`, `pr`, `writing-for-agents`, cùng bộ
Superpowers như `brainstorming`, `writing-plans`, `test-driven-development`,
`systematic-debugging`, `requesting-code-review`, `using-git-worktrees`...

> OpenCode chỉ hiện các skill model-invoked trong danh sách của agent. Các skill
> user-invoked được giữ kín và gọi qua command wrapper ở `.opencode/commands/`.

## 3. Quy trình cho task mới

1. **Setup (một lần):** `/setup-matt-pocock-skills`.
2. **Làm rõ yêu cầu:**
   - Task phức tạp, cần glossary/ADR: `/grill-with-docs`.
   - Task nhỏ, chỉ cần thống nhất plan: `/grill-me`.
   - Trả lời từng round; **không code** trước khi chốt shared understanding.
3. **Lập plan:** Superpowers `writing-plans`, hoặc `/to-spec` → `/to-tickets`.
4. **Thực hiện:** TDD (`tdd` / `test-driven-development`), cập nhật
   `api-contract/` + `matrix-api.md` nếu chạm API.
5. **Review & xác minh:** `code-review`, `requesting-code-review`,
   `verification-before-completion`; chạy test thật và dẫn lại output.

Với dự án MediBook (nhiều service, contract-first), mặc định dùng
`/grill-with-docs` cho thay đổi lớn để giữ `GLOSSARY.md` và ADR đồng bộ.

## 4. Cập nhật skill

### Matt Pocock

Cách chính thức (cần Node >= 22.20):

```bash
npx skills@latest add mattpocock/skills -a opencode
```

Máy hiện tại dùng Node 20.20.2 nên nếu chưa nâng Node, cập nhật thủ công:
tải zip từ nhánh `main`, copy đè các thư mục trong `skills/engineering` và
`skills/productivity` vào `.agents/skills/`, rồi cập nhật commit trong
`.agents/skills/mattpocock/SOURCE.md`.

### Superpowers

Plugin lấy từ Git `main`; khi cần ghim phiên bản, thêm tag vào spec trong
`opencode.json`, ví dụ:

```json
"superpowers@git+https://github.com/obra/superpowers.git#v7.0.2"
```

Sau khi đổi plugin, mở lại project hoặc reload OpenCode.

## 5. OfficeCLI (tuỳ chọn)

Chỉ dùng khi cần tạo/đọc/sửa `.docx`, `.xlsx`, `.pptx`. Binary chưa được cài.

```powershell
irm https://d.officecli.ai/install.ps1 | iex
officecli --version
```

Sau khi có binary, có thể đăng ký MCP cho OpenCode:

```powershell
officecli mcp opencode
```

Nếu không làm việc với file Office thường xuyên, bỏ qua bước này.

## 6. Thêm skill nội bộ

1. Tạo `.opencode/skills/<skill-id>/SKILL.md` (ưu tiên project-specific) hoặc
   `.agents/skills/<skill-id>/SKILL.md` (dùng chung nhiều agent).
2. Frontmatter tối thiểu:

   ```yaml
   ---
   name: Tên hiển thị
   description: Khi nào agent nên dùng skill này
   ---
   ```

3. Nếu skill chỉ dành cho người gọi, thêm `disable-model-invocation: true`.
4. Tạo command wrapper nếu muốn gọi bằng slash:

   ```md
   ---
   description: Mô tả ngắn
   ---

   Use the `skill` tool to load the `<skill-id>` skill, then follow it.
   $ARGUMENTS
   ```

5. Không sửa file upstream trong `.agents/skills/` nếu muốn cập nhật dễ dàng;
   đặt phần tuỳ biến vào `.opencode/skills/`.
