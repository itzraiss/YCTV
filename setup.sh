#!/bin/bash

# ========================================
# STREAMVAULT BRASIL - SETUP AUTOMÁTICO
# ========================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Banner
echo -e "${PURPLE}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║    🎬 STREAMVAULT BRASIL - SETUP AUTOMÁTICO                   ║
║                                                               ║
║    Plataforma de Streaming Brasileira Completa               ║
║    Sistema tipo Acteia, mas 100% Legal                       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Verificar se está rodando como root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}❌ Este script não deve ser executado como root${NC}"
   exit 1
fi

# Função para imprimir mensagens
print_status() {
    echo -e "${BLUE}🔄 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

# Verificar dependências
check_dependencies() {
    print_status "Verificando dependências..."
    
    # Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js não encontrado. Instalando..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            print_warning "Node.js versão $NODE_VERSION encontrada. Recomendado: 18+"
        else
            print_success "Node.js $(node --version) encontrado"
        fi
    fi
    
    # Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker não encontrado. Instalando..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
        sudo usermod -aG docker $USER
        rm get-docker.sh
        print_warning "Docker instalado. Você precisa fazer logout/login para usar sem sudo"
    else
        print_success "Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1) encontrado"
    fi
    
    # Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_status "Instalando Docker Compose..."
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
    else
        print_success "Docker Compose $(docker-compose --version | cut -d' ' -f3 | cut -d',' -f1) encontrado"
    fi
    
    # Git
    if ! command -v git &> /dev/null; then
        print_status "Instalando Git..."
        sudo apt-get update
        sudo apt-get install -y git
    else
        print_success "Git $(git --version | cut -d' ' -f3) encontrado"
    fi
    
    # Curl
    if ! command -v curl &> /dev/null; then
        print_status "Instalando Curl..."
        sudo apt-get install -y curl
    else
        print_success "Curl encontrado"
    fi
}

# Configurar projeto
setup_project() {
    print_status "Configurando projeto StreamVault Brasil..."
    
    # Criar estrutura de diretórios
    mkdir -p backend/{src/{config,controllers,middleware,models,routes,services,utils,jobs},public/{uploads,temp,assets},logs,tests}
    mkdir -p frontend/{public/{assets/{images,icons,videos}},src/{components/{common,media,user,payment,embed},pages,hooks,services,store,styles,utils}}
    mkdir -p mobile/{android,ios,src}
    mkdir -p embed
    mkdir -p scripts
    mkdir -p docker/{ssl,grafana/{dashboards,datasources}}
    mkdir -p docs
    mkdir -p .github/workflows
    
    print_success "Estrutura de diretórios criada"
    
    # Configurar backend
    if [ ! -f "backend/package.json" ]; then
        print_status "Configurando backend..."
        cd backend
        npm init -y
        
        # Instalar dependências principais
        npm install express mongoose bcryptjs jsonwebtoken cors helmet compression morgan express-rate-limit express-validator express-fileupload dotenv winston winston-daily-rotate-file redis ioredis axios cheerio puppeteer sharp ffmpeg-static fluent-ffmpeg cloudinary multer multer-storage-cloudinary moment moment-timezone validator slug uuid qrcode mercadopago nodemailer handlebars node-cron node-cache cookie-parser express-session connect-redis passport passport-local passport-jwt passport-google-oauth20 passport-facebook firebase-admin socket.io xml2js sitemap rss pm2
        
        # Instalar dependências de desenvolvimento
        npm install --save-dev nodemon jest supertest eslint eslint-config-airbnb-base eslint-plugin-import prettier @types/node
        
        cd ..
        print_success "Backend configurado"
    fi
    
    # Configurar frontend
    if [ ! -f "frontend/package.json" ]; then
        print_status "Configurando frontend..."
        cd frontend
        
        # Criar projeto React com Vite
        npm create vite@latest . -- --template react
        
        # Instalar dependências adicionais
        npm install axios zustand react-router-dom @heroicons/react react-input-mask react-currency-input-field qrcode.react react-hot-toast js-cookie @types/js-cookie clsx date-fns react-hook-form @hookform/resolvers zod swiper react-player lucide-react tailwindcss @tailwindcss/typography @tailwindcss/forms @tailwindcss/aspect-ratio postcss autoprefixer
        
        # Configurar Tailwind
        npx tailwindcss init -p
        
        cd ..
        print_success "Frontend configurado"
    fi
}

# Configurar variáveis de ambiente
setup_environment() {
    print_status "Configurando variáveis de ambiente..."
    
    # Backend .env
    if [ ! -f "backend/.env" ]; then
        cp backend/.env.example backend/.env
        print_info "Arquivo backend/.env criado. Configure suas chaves API!"
    fi
    
    # Frontend .env
    if [ ! -f "frontend/.env" ]; then
        cat > frontend/.env << EOF
VITE_API_URL=http://localhost:3000/api
VITE_BACKEND_URL=http://localhost:3000
VITE_EMBED_URL=http://localhost:3000/embed
VITE_APP_NAME=StreamVault Brasil
VITE_APP_VERSION=1.0.0
EOF
        print_success "Arquivo frontend/.env criado"
    fi
}

# Configurar Docker
setup_docker() {
    print_status "Configurando Docker..."
    
    # Dockerfile backend
    cat > docker/Dockerfile.backend << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    curl

# Configurar Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copiar package files
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código
COPY . .

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Mudar ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
EOF

    # Dockerfile frontend
    cat > docker/Dockerfile.frontend << 'EOF'
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx-frontend.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
EOF

    # Nginx config para frontend
    cat > docker/nginx-frontend.conf << 'EOF'
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Handle React Router
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

    # Nginx principal
    cat > docker/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:3000;
    }

    upstream frontend {
        server frontend:80;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=embed:10m rate=30r/s;

    server {
        listen 80;
        server_name localhost;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "no-referrer-when-downgrade" always;
        add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

        # Frontend
        location / {
            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # API
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Embed
        location /embed/ {
            limit_req zone=embed burst=50 nodelay;
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Health check
        location /health {
            proxy_pass http://backend;
        }
    }
}
EOF

    # Redis config
    cat > docker/redis.conf << 'EOF'
# Redis configuration for StreamVault Brasil
bind 0.0.0.0
port 6379
timeout 0
tcp-keepalive 300
daemonize no
supervised no
pidfile /var/run/redis_6379.pid
loglevel notice
databases 16
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir ./
maxmemory 256mb
maxmemory-policy allkeys-lru
EOF

    # MongoDB init script
    cat > docker/mongo-init.js << 'EOF'
db = db.getSiblingDB('streamvault-brasil');

db.createUser({
  user: 'streamvault',
  pwd: 'streamvault123',
  roles: [
    {
      role: 'readWrite',
      db: 'streamvault-brasil'
    }
  ]
});

// Create indexes
db.media.createIndex({ "tmdbId": 1, "type": 1 }, { unique: true });
db.media.createIndex({ "slug": 1 }, { unique: true });
db.media.createIndex({ "title": "text", "description": "text" });
db.media.createIndex({ "genre": 1 });
db.media.createIndex({ "year": 1 });
db.media.createIndex({ "rating.tmdb.average": -1 });
db.media.createIndex({ "popularity": -1 });
db.media.createIndex({ "featured": 1, "trending": 1 });
db.media.createIndex({ "isActive": 1 });
db.media.createIndex({ "createdAt": -1 });

db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "subscription.status": 1 });
db.users.createIndex({ "isActive": 1 });

db.payments.createIndex({ "userId": 1 });
db.payments.createIndex({ "transactionId": 1 }, { unique: true });
db.payments.createIndex({ "mercadoPagoId": 1 });
db.payments.createIndex({ "status": 1 });
db.payments.createIndex({ "createdAt": -1 });

print("Database initialized successfully!");
EOF

    print_success "Docker configurado"
}

# Configurar Git
setup_git() {
    if [ ! -d ".git" ]; then
        print_status "Inicializando repositório Git..."
        git init
        
        # .gitignore
        cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs/
*.log
pids/
*.pid
*.seed
*.pid.lock

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# Build outputs
dist/
build/
.next/
out/

# Database
*.db
*.sqlite

# Temporary files
tmp/
temp/
.tmp/
uploads/
public/uploads/

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# Docker
.dockerignore

# SSL certificates
*.pem
*.key
*.crt

# Backup files
*.backup
*.bak

# Cache
.cache/
.parcel-cache/

# PM2
.pm2/

# ESLint cache
.eslintcache
EOF

        git add .
        git commit -m "🎉 Initial commit - StreamVault Brasil"
        
        print_success "Repositório Git inicializado"
    fi
}

# Instalar e configurar
install_project() {
    print_status "Instalando dependências do projeto..."
    
    # Backend
    if [ -f "backend/package.json" ]; then
        cd backend
        print_status "Instalando dependências do backend..."
        npm install
        cd ..
        print_success "Dependências do backend instaladas"
    fi
    
    # Frontend
    if [ -f "frontend/package.json" ]; then
        cd frontend
        print_status "Instalando dependências do frontend..."
        npm install
        cd ..
        print_success "Dependências do frontend instaladas"
    fi
}

# Executar testes
run_tests() {
    print_status "Executando testes de configuração..."
    
    # Teste Docker
    if docker --version &> /dev/null; then
        print_success "Docker está funcionando"
    else
        print_error "Docker não está funcionando"
    fi
    
    # Teste Node.js
    if node --version &> /dev/null; then
        print_success "Node.js está funcionando"
    else
        print_error "Node.js não está funcionando"
    fi
    
    # Teste estrutura de arquivos
    if [ -f "backend/package.json" ] && [ -f "frontend/package.json" ]; then
        print_success "Estrutura do projeto está correta"
    else
        print_error "Estrutura do projeto está incompleta"
    fi
}

# Gerar relatório final
generate_report() {
    echo -e "\n${PURPLE}========================================${NC}"
    echo -e "${PURPLE}🎉 SETUP CONCLUÍDO COM SUCESSO!${NC}"
    echo -e "${PURPLE}========================================${NC}\n"
    
    echo -e "${GREEN}✅ StreamVault Brasil está pronto para uso!${NC}\n"
    
    echo -e "${CYAN}📋 PRÓXIMOS PASSOS:${NC}"
    echo -e "${YELLOW}1.${NC} Configure suas chaves API em ${BLUE}backend/.env${NC}"
    echo -e "   - TMDB_API_KEY (obrigatório)"
    echo -e "   - MERCADO_PAGO_ACCESS_TOKEN"
    echo -e "   - JWT_SECRET"
    echo -e ""
    echo -e "${YELLOW}2.${NC} Inicie o projeto:"
    echo -e "   ${BLUE}docker-compose up -d${NC}"
    echo -e ""
    echo -e "${YELLOW}3.${NC} Sincronize o catálogo:"
    echo -e "   ${BLUE}docker exec streamvault-backend node src/jobs/syncCatalog.js full${NC}"
    echo -e ""
    echo -e "${YELLOW}4.${NC} Acesse a plataforma:"
    echo -e "   🌐 Frontend: ${BLUE}http://localhost:3001${NC}"
    echo -e "   🔗 Backend API: ${BLUE}http://localhost:3000${NC}"
    echo -e "   🎬 Embed Player: ${BLUE}http://localhost:3000/embed/movie/550${NC}"
    echo -e "   📊 Monitoring: ${BLUE}http://localhost:3002${NC} (admin/streamvault123)"
    echo -e ""
    
    echo -e "${CYAN}🚀 RECURSOS DISPONÍVEIS:${NC}"
    echo -e "   ✅ Sistema tipo Acteia (mas legal)"
    echo -e "   ✅ Catálogo TMDB automático"
    echo -e "   ✅ Pagamentos brasileiros (PIX, Cartão, Boleto)"
    echo -e "   ✅ Interface tipo Netflix"
    echo -e "   ✅ Sistema de embed profissional"
    echo -e "   ✅ Sincronização automática 24/7"
    echo -e "   ✅ Monitoramento completo"
    echo -e "   ✅ Deploy com Docker"
    echo -e ""
    
    echo -e "${CYAN}📞 SUPORTE:${NC}"
    echo -e "   📧 Email: ${BLUE}suporte@streamvault.com.br${NC}"
    echo -e "   🐛 Issues: ${BLUE}https://github.com/seuusuario/streamvault-brasil/issues${NC}"
    echo -e ""
    
    echo -e "${GREEN}🎬 Sua plataforma de streaming brasileira está pronta!${NC}"
    echo -e "${GREEN}Agora você pode competir com Netflix, Prime Video e Disney+!${NC}\n"
}

# Menu principal
main_menu() {
    echo -e "${CYAN}Escolha uma opção:${NC}"
    echo -e "${YELLOW}1.${NC} Setup completo (recomendado)"
    echo -e "${YELLOW}2.${NC} Apenas verificar dependências"
    echo -e "${YELLOW}3.${NC} Apenas configurar projeto"
    echo -e "${YELLOW}4.${NC} Apenas configurar Docker"
    echo -e "${YELLOW}5.${NC} Executar testes"
    echo -e "${YELLOW}6.${NC} Sair"
    echo -e ""
    read -p "Digite sua escolha (1-6): " choice
    
    case $choice in
        1)
            check_dependencies
            setup_project
            setup_environment
            setup_docker
            setup_git
            install_project
            run_tests
            generate_report
            ;;
        2)
            check_dependencies
            ;;
        3)
            setup_project
            setup_environment
            install_project
            ;;
        4)
            setup_docker
            ;;
        5)
            run_tests
            ;;
        6)
            echo -e "${GREEN}👋 Até logo!${NC}"
            exit 0
            ;;
        *)
            print_error "Opção inválida. Tente novamente."
            main_menu
            ;;
    esac
}

# Verificar argumentos da linha de comando
if [ "$1" = "--auto" ] || [ "$1" = "-a" ]; then
    print_info "Executando setup automático completo..."
    check_dependencies
    setup_project
    setup_environment
    setup_docker
    setup_git
    install_project
    run_tests
    generate_report
elif [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo -e "${CYAN}StreamVault Brasil - Setup Script${NC}"
    echo -e ""
    echo -e "${YELLOW}Uso:${NC}"
    echo -e "  ./setup.sh           - Menu interativo"
    echo -e "  ./setup.sh --auto    - Setup automático completo"
    echo -e "  ./setup.sh --help    - Mostrar esta ajuda"
    echo -e ""
    echo -e "${YELLOW}Opções:${NC}"
    echo -e "  -a, --auto    Setup automático sem interação"
    echo -e "  -h, --help    Mostrar ajuda"
    echo -e ""
else
    main_menu
fi