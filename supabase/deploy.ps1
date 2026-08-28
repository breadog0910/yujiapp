# ============================================================
# 《予己》Supabase Edge Functions 一键部署脚本 (Windows)
# 使用方法：
#   1. 修改下方的 $PROJECT_REF 为你的项目 Reference ID
#   2. 确保已安装 Supabase CLI:  scoop install supabase
#   3. 右键 PowerShell → 以管理员身份运行
#   4. cd 到本脚本所在目录，执行: .\deploy.ps1
# ============================================================

# ---------- 配置区（必填） ----------
$PROJECT_REF = "你的-project-ref"   # 从 Supabase Dashboard → Settings → General → Reference ID 复制

# ---------- 颜色输出 ----------
function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERR]  $msg" -ForegroundColor Red }

# ---------- 检查配置 ----------
if ($PROJECT_REF -eq "你的-project-ref" -or $PROJECT_REF -eq "") {
    Write-Err "请先修改脚本中的 `$PROJECT_REF 变量！"
    Write-Info "获取方式: Supabase Dashboard → Project Settings → General → Reference ID"
    exit 1
}

# ---------- 检查 Supabase CLI ----------
Write-Info "检查 Supabase CLI..."
$sb = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $sb) {
    Write-Err "未找到 supabase 命令。请先安装 CLI:"
    Write-Info "  scoop install supabase"
    Write-Info "  或: npm install -g supabase"
    exit 1
}
Write-Ok "Supabase CLI 已安装"

# ---------- 检查登录状态 ----------
Write-Info "检查登录状态..."
$loginCheck = supabase projects list 2>&1
if ($LASTEXITCODE -ne 0 -or $loginCheck -match "not logged in") {
    Write-Warn "尚未登录 Supabase，开始登录流程..."
    supabase login
} else {
    Write-Ok "已登录 Supabase"
}

# ---------- 检查项目链接 ----------
Write-Info "检查项目链接..."
$linkedRef = ""
try {
    $linkedRef = (supabase status 2>$null | Select-String "Linked project" | ForEach-Object { $_.Line -replace '.*Linked project: ','' }).Trim()
} catch { }

if ($linkedRef -eq $PROJECT_REF) {
    Write-Ok "已链接到项目 $PROJECT_REF"
} else {
    Write-Info "正在链接项目 $PROJECT_REF ..."
    supabase link --project-ref $PROJECT_REF
    if ($LASTEXITCODE -ne 0) {
        Write-Err "项目链接失败，请检查 Reference ID 是否正确"
        exit 1
    }
    Write-Ok "项目链接成功"
}

# ---------- 部署 Edge Functions ----------
Write-Info "开始部署 Edge Functions..."

$functions = @("ai-agent", "ai-chain", "admin-api", "star-miner")
$failed = @()

foreach ($fn in $functions) {
    Write-Info "部署 $fn ..."
    supabase functions deploy $fn
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "$fn 部署成功"
    } else {
        Write-Err "$fn 部署失败"
        $failed += $fn
    }
}

# ---------- 设置 Secrets（可选） ----------
Write-Info ""
Write-Info "=========================================="
Write-Info "部署阶段完成。"
Write-Info "=========================================="

if ($failed.Count -gt 0) {
    Write-Warn "以下函数部署失败，请检查上方错误信息:"
    $failed | ForEach-Object { Write-Warn "  - $_" }
} else {
    Write-Ok "所有 Edge Functions 部署成功！"
}

Write-Info ""
Write-Info "【下一步 - 手动操作】"
Write-Info "1. 在 Supabase Dashboard → SQL Editor 中执行:"
Write-Info "   - supabase/migrations/001_init_schema.sql"
Write-Info "   - supabase/migrations/002_seed_data.sql"
Write-Info ""
Write-Info "2. 在 Dashboard → Edge Functions → Secrets 中添加:"
Write-Info "   - SUPABASE_URL = https://$PROJECT_REF.supabase.co"
Write-Info "   - SUPABASE_SERVICE_ROLE_KEY = (从 Settings → API 复制 service_role secret)"
Write-Info ""
Write-Info "3. 修改 yuji-app/index.html 中的 SUPABASE_URL 和 SUPABASE_ANON_KEY"
Write-Info ""
Write-Info "4. 注册第一个账号后，在 Dashboard → Table Editor → users 表"
Write-Info "   将该用户的 role 字段改为 'admin'"
Write-Info ""

Read-Host "按 Enter 键退出"
