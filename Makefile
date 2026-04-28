WEB_DIR := web
WEB_NODE_MODULES := $(WEB_DIR)/node_modules
WEB_INSTALL_STAMP := $(WEB_NODE_MODULES)/.install-stamp
WEB_PACKAGE_JSON := $(WEB_DIR)/package.json
WEB_PACKAGE_LOCK := $(WEB_DIR)/package-lock.json
WEB_INSTALL_INPUTS := $(WEB_PACKAGE_JSON) $(wildcard $(WEB_PACKAGE_LOCK))

.PHONY: all help install-web dev build preview audit audit-fix clean

all: build

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  all           Install dependencies if needed and build"
	@echo ""
	@echo "Web SPA"
	@echo "  install-web   Install Node dependencies in web/ with npm ci or npm install"
	@echo "  dev           Start Vite dev server"
	@echo "  build         Build the SPA for production (outputs web/dist)"
	@echo "  preview       Preview the production build locally"
	@echo "  audit         Run npm audit in web/"
	@echo "  audit-fix     Run npm audit fix in web/"
	@echo "  clean         Remove web/dist and web/node_modules"

# ── Web SPA ───────────────────────────────────────────────────────────────────

$(WEB_INSTALL_STAMP): $(WEB_INSTALL_INPUTS)
	if [ -f $(WEB_PACKAGE_LOCK) ]; then cd $(WEB_DIR) && npm ci; else cd $(WEB_DIR) && npm install; fi
	mkdir -p $(WEB_NODE_MODULES)
	touch $(WEB_INSTALL_STAMP)

install-web: $(WEB_INSTALL_STAMP)

dev: install-web
	cd $(WEB_DIR) && npm run dev

build: install-web
	cd $(WEB_DIR) && npm run build

preview: install-web
	cd $(WEB_DIR) && npm run preview

audit: install-web
	cd $(WEB_DIR) && npm audit

audit-fix: install-web
	cd $(WEB_DIR) && npm audit fix

clean:
	rm -rf $(WEB_DIR)/dist $(WEB_NODE_MODULES)
