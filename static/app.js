const state = {
    activeTab: "info",
    projects: [],
    expandedProjects: [],
    projectDatasets: {},
    expandedDatasets: [],
    datasetTables: {},
    currentProject: "",
    currentDataset: "",
    currentTable: "",
    tableSchema: [],
    tableMetadata: {},
    query: "",
    queryResults: null,
    isRunningQuery: false,
    error: null,
    cmEditor: null,
    cmJson: null,
    jsonDirty: false,
    editorRefreshRaf: null,
    jsonRefreshRaf: null,
    resultRenderFrame: null,
    resultRenderToken: 0,
    urlUpdateDebounceTimer: null,
    ui: {
        sidebarWidth: 340,
        editorHeight: 300,
        sidebarCollapsed: false,
        editorCollapsed: false
    }
};

const elements = {
    workspaceShell: document.getElementById("workspaceShell"),
    contentArea: document.getElementById("contentArea"),
    editorSurface: document.querySelector(".editor-surface"),
    sqlEditorHost: document.getElementById("codemirror-editor"),
    projectTree: document.getElementById("projectTree"),
    refreshResourcesBtn: document.getElementById("refreshResourcesBtn"),
    toggleSidebarBtn: document.getElementById("toggleSidebarBtn"),
    toggleEditorBtn: document.getElementById("toggleEditorBtn"),
    sidebarResizeHandle: document.getElementById("sidebarResizeHandle"),
    editorResizeHandle: document.getElementById("editorResizeHandle"),
    queryEditorCard: document.getElementById("queryEditorCard"),
    resultsCard: document.getElementById("resultsCard"),
    queryTitle: document.getElementById("queryTitle"),
    runQueryBtn: document.getElementById("runQueryBtn"),
    formatQueryBtn: document.getElementById("formatQueryBtn"),
    runQueryBtnText: document.getElementById("runQueryBtnText"),
    infoTab: document.getElementById("infoTab"),
    resultsTab: document.getElementById("resultsTab"),
    jsonTab: document.getElementById("jsonTab"),
    infoTabContent: document.getElementById("infoTabContent"),
    resultsTabContent: document.getElementById("resultsTabContent"),
    jsonTabContent: document.getElementById("jsonTabContent"),
    queryResultsContainer: document.getElementById("queryResultsContainer"),
    noResultsMessage: document.getElementById("noResultsMessage"),
    resultCount: document.getElementById("resultCount"),
    queryResultsHeader: document.getElementById("queryResultsHeader"),
    queryResultsBody: document.getElementById("queryResultsBody"),
    schemaTableBody: document.getElementById("schemaTableBody"),
    jsonView: document.getElementById("jsonView"),
    tableFullName: document.getElementById("tableFullName"),
    tableDescription: document.getElementById("tableDescription"),
    tableNumRows: document.getElementById("tableNumRows"),
    tableSize: document.getElementById("tableSize"),
    tableType: document.getElementById("tableType"),
    tableLocation: document.getElementById("tableLocation"),
    tableCreated: document.getElementById("tableCreated"),
    tableModified: document.getElementById("tableModified"),
    shareBtn: document.getElementById("shareBtn")
};

const UI_STORAGE_KEY = "bigqueryExplorerUILayout";
const UI_DEFAULTS = {
    sidebarWidth: 340,
    editorHeight: 300,
    sidebarCollapsed: false,
    editorCollapsed: false
};
const UI_LIMITS = {
    minSidebarWidth: 260,
    maxSidebarWidth: 640,
    minEditorHeight: 180,
    maxEditorHeight: 720,
    collapsedEditorHeight: 58
};
const RESULT_RENDER_BATCH_SIZE = 40;
const CELL_PREVIEW_MAX_CHARS = 320;
const CELL_PREVIEW_MAX_LINES = 5;

let editorResizeObserver = null;
let jsonResizeObserver = null;

document.addEventListener("DOMContentLoaded", async function() {
    loadUiPreferences();
    setupEventListeners();
    setupResizeObservers();
    updateContentAreaState();
    applyUiLayout(false);
    renderTableInfo();
    renderQueryResults();

    await loadProjects();

    const params = getParamsFromUrl();
    if (params.project && params.dataset && params.table) {
        await applyParamsToState(params);
    } else {
        switchTab("info");
    }
});

function getParamsFromUrl() {
    const params = new URLSearchParams(location.search);
    const project = params.get("project") || "";
    const dataset = params.get("dataset") || "";
    const table = params.get("table") || "";
    let results = params.get("results") || "info";
    const resultsMap = { infoTab: "info", resultsTab: "results", jsonTab: "json" };

    if (resultsMap[results]) {
        results = resultsMap[results];
    }
    if (!["info", "results", "json"].includes(results)) {
        results = "info";
    }

    let query = "";
    const encodedQuery = params.get("query");
    if (encodedQuery) {
        try {
            query = atob(encodedQuery);
        } catch (error) {
            query = "";
        }
    }

    return { project, dataset, table, results, query };
}

function getUrlFromState() {
    if (!state.currentProject || !state.currentDataset || !state.currentTable) {
        return "";
    }

    const params = new URLSearchParams();
    params.set("project", state.currentProject);
    params.set("dataset", state.currentDataset);
    params.set("table", state.currentTable);
    params.set("results", state.activeTab);
    if (state.query) {
        params.set("query", btoa(state.query));
    }

    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
}

function replaceUrlFromState() {
    const queryString = getUrlFromState();
    const nextUrl = `${location.pathname}${queryString}`;
    if (`${location.pathname}${location.search}` !== nextUrl) {
        history.replaceState(null, "", nextUrl);
    }
}

function scheduleUrlReplace() {
    if (state.urlUpdateDebounceTimer) {
        clearTimeout(state.urlUpdateDebounceTimer);
    }
    state.urlUpdateDebounceTimer = setTimeout(replaceUrlFromState, 400);
}

function shareLink() {
    if (!state.currentProject || !state.currentDataset || !state.currentTable) {
        alert("Select a table to share a link.");
        return;
    }

    const shareUrl = `${location.origin}${location.pathname}${getUrlFromState()}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
        const originalHtml = elements.shareBtn.innerHTML;
        elements.shareBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        elements.shareBtn.disabled = true;

        setTimeout(() => {
            elements.shareBtn.innerHTML = originalHtml;
            elements.shareBtn.disabled = false;
        }, 2000);
    }).catch(() => {
        alert("Could not copy link. You can copy it from the address bar.");
    });
}

function setupEventListeners() {
    elements.runQueryBtn.addEventListener("click", runQuery);
    elements.formatQueryBtn.addEventListener("click", formatQuery);
    elements.refreshResourcesBtn.addEventListener("click", refreshResources);
    elements.toggleSidebarBtn.addEventListener("click", toggleSidebarCollapsed);
    elements.toggleEditorBtn.addEventListener("click", toggleEditorCollapsed);
    elements.shareBtn.addEventListener("click", shareLink);

    elements.infoTab.addEventListener("click", () => switchTab("info"));
    elements.resultsTab.addEventListener("click", () => switchTab("results"));
    elements.jsonTab.addEventListener("click", () => switchTab("json"));

    setupResizeInteractions();
    window.addEventListener("resize", debounce(() => applyUiLayout(false), 80));

    window.addEventListener("popstate", async function() {
        const params = getParamsFromUrl();
        if (params.project && params.dataset && params.table) {
            await applyParamsToState(params);
        }
    });
}

function setupResizeObservers() {
    if (typeof ResizeObserver !== "function") {
        return;
    }

    editorResizeObserver = new ResizeObserver(() => {
        if (state.cmEditor && !elements.queryEditorCard.hidden && !state.ui.editorCollapsed) {
            requestEditorRefresh();
        }
    });
    editorResizeObserver.observe(elements.editorSurface);

    jsonResizeObserver = new ResizeObserver(() => {
        if (state.cmJson && state.activeTab === "json" && !elements.jsonTabContent.hidden) {
            requestJsonRefresh();
        }
    });
    jsonResizeObserver.observe(elements.jsonTabContent);
}

function updateContentAreaState() {
    const hasData = !elements.queryEditorCard.hidden || !elements.resultsCard.hidden;
    elements.contentArea.classList.toggle("has-data", hasData);
}

function showDataPanels() {
    elements.queryEditorCard.hidden = false;
    elements.resultsCard.hidden = false;
    updateContentAreaState();
}

function switchTab(tabName) {
    state.activeTab = tabName;

    const isInfo = tabName === "info";
    const isResults = tabName === "results";
    const isJson = tabName === "json";

    setTabState(elements.infoTab, elements.infoTabContent, isInfo);
    setTabState(elements.resultsTab, elements.resultsTabContent, isResults);
    setTabState(elements.jsonTab, elements.jsonTabContent, isJson);

    if (isJson) {
        updateJsonView();
        requestJsonRefresh();
    }

    replaceUrlFromState();
}

function setTabState(button, panel, isActive) {
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    panel.hidden = !isActive;
    panel.setAttribute("aria-hidden", String(!isActive));
}

async function loadProjects() {
    try {
        const response = await axios.get("/api/projects");
        state.projects = response.data;
        renderProjects();
    } catch (error) {
        console.error("Error loading projects:", error);
        state.error = "Failed to load projects";
    }
}

function renderProjects() {
    elements.projectTree.innerHTML = "";

    state.projects.forEach((project) => {
        const projectItem = document.createElement("li");
        const projectButton = document.createElement("span");
        const projectIcon = document.createElement("i");

        projectButton.className = "tree-folder";
        projectButton.addEventListener("click", () => toggleProject(project));

        projectIcon.className = state.expandedProjects.includes(project) ? "fas fa-folder-open" : "fas fa-folder";
        projectButton.appendChild(projectIcon);
        projectButton.appendChild(document.createTextNode(` ${project}`));
        projectItem.appendChild(projectButton);

        if (state.expandedProjects.includes(project)) {
            const datasetList = document.createElement("ul");
            datasetList.className = "nested";

            (state.projectDatasets[project] || []).forEach((dataset) => {
                datasetList.appendChild(createDatasetElement(project, dataset));
            });

            projectItem.appendChild(datasetList);
        }

        elements.projectTree.appendChild(projectItem);
    });
}

function createDatasetElement(project, dataset) {
    const datasetItem = document.createElement("li");
    const datasetButton = document.createElement("span");
    const datasetIcon = document.createElement("i");
    const isExpanded = isDatasetExpanded(project, dataset);

    datasetButton.className = "tree-folder";
    datasetButton.addEventListener("click", () => toggleDataset(project, dataset));

    datasetIcon.className = isExpanded ? "fas fa-folder-open" : "fas fa-folder";
    datasetButton.appendChild(datasetIcon);
    datasetButton.appendChild(document.createTextNode(` ${dataset}`));
    datasetItem.appendChild(datasetButton);

    if (isExpanded) {
        const tableList = document.createElement("ul");
        tableList.className = "nested";
        const key = `${project}-${dataset}`;

        (state.datasetTables[key] || []).forEach((table) => {
            const tableItem = document.createElement("li");
            const tableButton = document.createElement("span");
            const tableIcon = document.createElement("i");

            tableButton.className = "tree-item";
            tableButton.addEventListener("click", () => selectTable(project, dataset, table));

            tableIcon.className = "fas fa-table";
            tableButton.appendChild(tableIcon);
            tableButton.appendChild(document.createTextNode(` ${table}`));

            tableItem.appendChild(tableButton);
            tableList.appendChild(tableItem);
        });

        datasetItem.appendChild(tableList);
    }

    return datasetItem;
}

async function toggleProject(project) {
    if (state.expandedProjects.includes(project)) {
        state.expandedProjects = state.expandedProjects.filter((currentProject) => currentProject !== project);
    } else {
        state.expandedProjects.push(project);
        await loadDatasets(project);
    }

    renderProjects();
}

async function loadDatasets(project) {
    if (state.projectDatasets[project]) {
        return;
    }

    try {
        const response = await axios.get(`/api/projects/${project}/datasets`);
        state.projectDatasets[project] = response.data;
    } catch (error) {
        console.error(`Error loading datasets for project ${project}:`, error);
    }
}

async function toggleDataset(project, dataset) {
    const key = `${project}-${dataset}`;
    if (state.expandedDatasets.includes(key)) {
        state.expandedDatasets = state.expandedDatasets.filter((expandedKey) => expandedKey !== key);
    } else {
        state.expandedDatasets.push(key);
        await loadTables(project, dataset);
    }

    renderProjects();
}

function isDatasetExpanded(project, dataset) {
    return state.expandedDatasets.includes(`${project}-${dataset}`);
}

async function loadTables(project, dataset) {
    const key = `${project}-${dataset}`;
    if (state.datasetTables[key]) {
        return;
    }

    try {
        const response = await axios.get(`/api/projects/${project}/datasets/${dataset}/tables`);
        state.datasetTables[key] = response.data;
    } catch (error) {
        console.error(`Error loading tables for dataset ${dataset}:`, error);
    }
}

async function applyParamsToState(params) {
    const { project, dataset, table, results, query } = params;
    if (!project || !dataset || !table || !state.projects.length || !state.projects.includes(project)) {
        return;
    }

    if (!state.expandedProjects.includes(project)) {
        state.expandedProjects.push(project);
        await loadDatasets(project);
    }

    if (!state.projectDatasets[project] || !state.projectDatasets[project].includes(dataset)) {
        return;
    }

    const datasetKey = `${project}-${dataset}`;
    if (!state.expandedDatasets.includes(datasetKey)) {
        state.expandedDatasets.push(datasetKey);
        await loadTables(project, dataset);
    }

    if (!state.datasetTables[datasetKey] || !state.datasetTables[datasetKey].includes(table)) {
        return;
    }

    state.currentProject = project;
    state.currentDataset = dataset;
    state.currentTable = table;
    state.activeTab = results;
    state.tableSchema = [];
    state.tableMetadata = {};
    state.queryResults = null;
    state.jsonDirty = true;
    state.query = query && query.trim() ? query : buildDefaultQuery(project, dataset, table);

    elements.queryTitle.textContent = `Query: ${project}.${dataset}.${table}`;
    showDataPanels();
    applyUiLayout(false);
    renderProjects();
    renderTableInfo();
    renderQueryResults();
    setQueryEditorValue(state.query);
    switchTab(state.activeTab);

    await loadTableSchema(project, dataset, table);
}

async function selectTable(project, dataset, table) {
    state.currentProject = project;
    state.currentDataset = dataset;
    state.currentTable = table;
    state.activeTab = "info";
    state.tableSchema = [];
    state.tableMetadata = {};
    state.queryResults = null;
    state.jsonDirty = true;
    state.query = buildDefaultQuery(project, dataset, table);

    elements.queryTitle.textContent = `Query: ${project}.${dataset}.${table}`;
    showDataPanels();
    applyUiLayout(false);
    renderTableInfo();
    renderQueryResults();
    setQueryEditorValue(state.query);
    switchTab("info");
    replaceUrlFromState();

    await loadTableSchema(project, dataset, table);
}

async function loadTableSchema(project, dataset, table) {
    try {
        const response = await axios.get(`/api/projects/${project}/datasets/${dataset}/tables/${table}/schema`);
        state.tableSchema = response.data.schema || [];
        state.tableMetadata = response.data || {};
        renderTableInfo();
    } catch (error) {
        console.error(`Error loading schema for table ${table}:`, error);
    }
}

function buildDefaultQuery(project, dataset, table) {
    return `SELECT * FROM \`${project}.${dataset}.${table}\` LIMIT 100`;
}

function ensureQueryEditor() {
    if (state.cmEditor) {
        return state.cmEditor;
    }

    state.cmEditor = CodeMirror(elements.sqlEditorHost, {
        value: state.query || "",
        mode: "text/x-sql",
        theme: "eclipse",
        lineNumbers: true,
        indentWithTabs: false,
        smartIndent: true,
        lineWrapping: true,
        matchBrackets: true,
        tabSize: 2,
        indentUnit: 2,
        viewportMargin: 30,
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Ctrl-Enter": runQuery,
            "Cmd-Enter": runQuery,
            "Alt-F": formatQuery,
            Tab: function(cm) {
                if (cm.somethingSelected()) {
                    cm.indentSelection("add");
                } else {
                    cm.replaceSelection("  ", "end", "+input");
                }
            }
        }
    });

    state.cmEditor.on("change", (cm) => {
        state.query = cm.getValue();
        scheduleUrlReplace();
    });

    requestEditorRefresh();
    return state.cmEditor;
}

function setQueryEditorValue(query) {
    const editor = ensureQueryEditor();
    if (editor.getValue() !== query) {
        editor.setValue(query);
    }
    requestEditorRefresh();
}

function ensureJsonEditor() {
    if (state.cmJson) {
        return state.cmJson;
    }

    state.cmJson = CodeMirror.fromTextArea(elements.jsonView, {
        mode: { name: "javascript", json: true },
        readOnly: true,
        theme: "eclipse",
        lineNumbers: true,
        viewportMargin: 20
    });

    requestJsonRefresh();
    return state.cmJson;
}

function updateJsonView() {
    if (state.cmJson && !state.jsonDirty) {
        return;
    }

    ensureJsonEditor();
    const nextValue = state.queryResults ? JSON.stringify(state.queryResults.rows || [], null, 2) : "[]";
    state.cmJson.setValue(nextValue);
    state.jsonDirty = false;
}

function requestEditorRefresh() {
    if (!state.cmEditor || state.ui.editorCollapsed || elements.queryEditorCard.hidden) {
        return;
    }
    if (state.editorRefreshRaf) {
        return;
    }

    state.editorRefreshRaf = window.requestAnimationFrame(() => {
        state.editorRefreshRaf = null;
        if (state.cmEditor && !state.ui.editorCollapsed && !elements.queryEditorCard.hidden) {
            state.cmEditor.refresh();
        }
    });
}

function requestJsonRefresh() {
    if (!state.cmJson || state.activeTab !== "json" || elements.jsonTabContent.hidden) {
        return;
    }
    if (state.jsonRefreshRaf) {
        return;
    }

    state.jsonRefreshRaf = window.requestAnimationFrame(() => {
        state.jsonRefreshRaf = null;
        if (state.cmJson && state.activeTab === "json" && !elements.jsonTabContent.hidden) {
            state.cmJson.refresh();
        }
    });
}

function formatQuery() {
    if (!state.cmEditor) {
        return;
    }

    try {
        const currentQuery = state.cmEditor.getValue();
        if (!currentQuery.trim()) {
            return;
        }

        const formattedSql = sqlFormatter.format(currentQuery, {
            language: "bigquery",
            uppercase: true
        });
        state.cmEditor.setValue(formattedSql);
    } catch (error) {
        console.error("Error formatting SQL:", error);
        alert(`Could not format SQL: ${error.message}`);
    }
}

async function runQuery() {
    if (!state.cmEditor) {
        return;
    }

    const currentQuery = state.cmEditor.getValue();
    if (!currentQuery.trim()) {
        alert("Please enter a SQL query");
        return;
    }

    state.isRunningQuery = true;
    state.query = currentQuery;
    elements.runQueryBtnText.textContent = "Running...";
    elements.runQueryBtn.disabled = true;
    elements.formatQueryBtn.disabled = true;

    try {
        const response = await axios.post("/api/query", { query: currentQuery });
        state.queryResults = response.data;
        state.jsonDirty = true;
        renderQueryResults();

        if (state.activeTab === "json") {
            updateJsonView();
            requestJsonRefresh();
        }

        switchTab("results");
    } catch (error) {
        console.error("Error running query:", error);
        const errorMessage = error.response?.data?.error || error.message || "Unknown error";
        alert(`Query error: ${errorMessage}`);
    } finally {
        state.isRunningQuery = false;
        elements.runQueryBtnText.textContent = "Run Query";
        elements.runQueryBtn.disabled = false;
        elements.formatQueryBtn.disabled = false;
    }
}

function renderTableInfo() {
    const metadata = state.tableMetadata || {};
    const hasSelection = Boolean(state.currentTable);

    elements.tableFullName.textContent = metadata.fullyQualifiedName || "";
    elements.tableDescription.textContent = metadata.description || (hasSelection ? "No description" : "");
    elements.tableNumRows.textContent = metadata.numRows ? Number(metadata.numRows).toLocaleString() : (hasSelection ? "Unknown" : "");
    elements.tableSize.textContent = hasSelection ? formatBytes(metadata.numBytes) : "";
    elements.tableType.textContent = metadata.type || (hasSelection ? "Standard" : "");
    elements.tableLocation.textContent = metadata.location || "";
    elements.tableCreated.textContent = formatDate(metadata.creationTime, hasSelection);
    elements.tableModified.textContent = formatDate(metadata.lastModified, hasSelection);

    elements.schemaTableBody.innerHTML = "";
    const schemaFragment = document.createDocumentFragment();

    state.tableSchema.forEach((field) => {
        const row = document.createElement("tr");
        row.appendChild(createCell(field.name));
        row.appendChild(createCell(field.type));
        row.appendChild(createCell(field.mode));
        row.appendChild(createCell(field.description || "-"));
        schemaFragment.appendChild(row);
    });

    elements.schemaTableBody.appendChild(schemaFragment);
}

function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value;
    return cell;
}

function renderQueryResults() {
    cancelPendingResultRender();

    const results = state.queryResults;
    const columns = results?.columns || [];
    const rows = results?.rows || [];

    elements.queryResultsHeader.innerHTML = "";
    elements.queryResultsBody.innerHTML = "";
    elements.queryResultsContainer.scrollTop = 0;
    elements.queryResultsContainer.scrollLeft = 0;
    elements.queryResultsContainer.setAttribute("aria-busy", "false");

    if (!results || !columns.length) {
        elements.queryResultsContainer.hidden = true;
        elements.noResultsMessage.hidden = false;
        elements.resultCount.hidden = true;
        elements.resultCount.textContent = "";
        return;
    }

    elements.queryResultsContainer.hidden = false;
    elements.noResultsMessage.hidden = rows.length > 0;
    elements.resultCount.hidden = false;
    elements.resultCount.textContent = formatNumber(results.total_rows ?? rows.length ?? 0);

    const headerRow = document.createElement("tr");
    columns.forEach((column) => {
        const headerCell = document.createElement("th");
        headerCell.textContent = column;
        headerRow.appendChild(headerCell);
    });
    elements.queryResultsHeader.appendChild(headerRow);
    elements.queryResultsContainer.setAttribute("aria-busy", "true");

    const renderToken = ++state.resultRenderToken;

    const renderBatch = (startIndex) => {
        if (renderToken !== state.resultRenderToken) {
            return;
        }

        const rowFragment = document.createDocumentFragment();
        const endIndex = Math.min(startIndex + RESULT_RENDER_BATCH_SIZE, rows.length);

        for (let rowIndex = startIndex; rowIndex < endIndex; rowIndex += 1) {
            const row = rows[rowIndex];
            const bodyRow = document.createElement("tr");

            columns.forEach((column) => {
                bodyRow.appendChild(createResultCell(row[column]));
            });

            rowFragment.appendChild(bodyRow);
        }

        elements.queryResultsBody.appendChild(rowFragment);

        if (endIndex < rows.length) {
            state.resultRenderFrame = window.requestAnimationFrame(() => renderBatch(endIndex));
            return;
        }

        elements.queryResultsContainer.setAttribute("aria-busy", "false");
        state.resultRenderFrame = null;
    };

    renderBatch(0);
}

function cancelPendingResultRender() {
    state.resultRenderToken += 1;
    if (state.resultRenderFrame) {
        window.cancelAnimationFrame(state.resultRenderFrame);
        state.resultRenderFrame = null;
    }
}

function createResultCell(rawValue) {
    const cell = document.createElement("td");
    const formattedValue = formatCellValue(rawValue);

    if (!formattedValue.expandable) {
        if (formattedValue.usePreformatted) {
            const content = document.createElement("pre");
            content.className = "query-cell-text mb-0";
            content.textContent = formattedValue.fullText;
            cell.className = "query-result-cell";
            cell.appendChild(content);
        } else {
            cell.textContent = formattedValue.fullText;
        }
        return cell;
    }

    cell.className = "query-result-cell";
    cell.appendChild(createExpandableCellContent(formattedValue));
    return cell;
}

function formatCellValue(rawValue) {
    if (rawValue === null) {
        return {
            fullText: "NULL",
            previewText: "NULL",
            expandable: false,
            usePreformatted: false
        };
    }

    if (Array.isArray(rawValue) || (rawValue !== undefined && rawValue !== null && rawValue.constructor === Object)) {
        const fullText = JSON.stringify(rawValue, null, 2);
        return {
            fullText,
            previewText: buildCellPreview(fullText),
            expandable: isExpandableCellText(fullText),
            usePreformatted: true
        };
    }

    const fullText = String(rawValue);
    return {
        fullText,
        previewText: buildCellPreview(fullText),
        expandable: isExpandableCellText(fullText),
        usePreformatted: fullText.includes("\n")
    };
}

function isExpandableCellText(text) {
    return text.length > CELL_PREVIEW_MAX_CHARS || text.split("\n").length > CELL_PREVIEW_MAX_LINES;
}

function buildCellPreview(text) {
    const lines = text.split("\n");
    const clippedLines = lines.slice(0, CELL_PREVIEW_MAX_LINES).map((line) => line.slice(0, CELL_PREVIEW_MAX_CHARS));
    let preview = clippedLines.join("\n");

    if (preview.length > CELL_PREVIEW_MAX_CHARS) {
        preview = `${preview.slice(0, CELL_PREVIEW_MAX_CHARS)}...`;
    } else if (lines.length > CELL_PREVIEW_MAX_LINES || text.length > preview.length) {
        preview = `${preview}...`;
    }

    return preview;
}

function createExpandableCellContent({ fullText, previewText, usePreformatted }) {
    const wrapper = document.createElement("div");
    const content = document.createElement(usePreformatted ? "pre" : "div");
    const toggle = document.createElement("button");

    wrapper.className = "query-cell-content is-collapsed";
    content.className = "query-cell-text";
    content.textContent = previewText;

    toggle.type = "button";
    toggle.className = "btn btn-link btn-sm query-cell-toggle";
    toggle.textContent = "Show more";

    let expanded = false;
    toggle.addEventListener("click", () => {
        expanded = !expanded;
        wrapper.classList.toggle("is-expanded", expanded);
        wrapper.classList.toggle("is-collapsed", !expanded);
        content.textContent = expanded ? fullText : previewText;
        toggle.textContent = expanded ? "Show less" : "Show more";
    });

    wrapper.appendChild(content);
    wrapper.appendChild(toggle);
    return wrapper;
}

function formatBytes(bytes) {
    if (bytes === undefined || bytes === null) {
        return "Unknown";
    }

    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes === 0) {
        return "0 Bytes";
    }

    const sizeIndex = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
    if (sizeIndex === 0) {
        return `${bytes} ${sizes[sizeIndex]}`;
    }

    return `${(bytes / Math.pow(1024, sizeIndex)).toFixed(2)} ${sizes[sizeIndex]}`;
}

function formatNumber(value) {
    if (value === undefined || value === null || value === "") {
        return "0";
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toLocaleString() : String(value);
}

function formatDate(dateString, hasSelection = true) {
    if (!dateString) {
        return hasSelection ? "Unknown" : "";
    }

    try {
        return new Date(dateString).toLocaleString();
    } catch (error) {
        return dateString;
    }
}

async function refreshResources() {
    const icon = elements.refreshResourcesBtn.querySelector("i");
    elements.refreshResourcesBtn.disabled = true;
    icon.classList.add("fa-spin");

    try {
        state.expandedProjects = [];
        state.projectDatasets = {};
        state.expandedDatasets = [];
        state.datasetTables = {};
        await loadProjects();
    } catch (error) {
        console.error("Error refreshing resources:", error);
        alert("Failed to refresh resources");
    } finally {
        elements.refreshResourcesBtn.disabled = false;
        icon.classList.remove("fa-spin");
    }
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function loadUiPreferences() {
    try {
        const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || "{}");
        state.ui = {
            sidebarWidth: Number(saved.sidebarWidth) || UI_DEFAULTS.sidebarWidth,
            editorHeight: Number(saved.editorHeight) || UI_DEFAULTS.editorHeight,
            sidebarCollapsed: saved.sidebarCollapsed === true,
            editorCollapsed: saved.editorCollapsed === true
        };
    } catch (error) {
        state.ui = { ...UI_DEFAULTS };
    }
}

function saveUiPreferences() {
    try {
        localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(state.ui));
    } catch (error) {
        console.warn("Could not save UI preferences:", error);
    }
}

function getSidebarWidthBounds() {
    const shellWidth = elements.workspaceShell?.clientWidth || window.innerWidth;
    return {
        min: UI_LIMITS.minSidebarWidth,
        max: Math.min(UI_LIMITS.maxSidebarWidth, Math.max(UI_LIMITS.minSidebarWidth, shellWidth - 320))
    };
}

function getEditorHeightBounds() {
    const contentHeight = elements.contentArea?.clientHeight || Math.max(window.innerHeight - 180, UI_LIMITS.minEditorHeight);
    return {
        min: UI_LIMITS.minEditorHeight,
        max: Math.min(UI_LIMITS.maxEditorHeight, Math.max(UI_LIMITS.minEditorHeight, contentHeight - 140))
    };
}

function applyUiLayout(persist = true) {
    const sidebarBounds = getSidebarWidthBounds();
    const editorBounds = getEditorHeightBounds();

    state.ui.sidebarWidth = clamp(Number(state.ui.sidebarWidth) || UI_DEFAULTS.sidebarWidth, sidebarBounds.min, sidebarBounds.max);
    state.ui.editorHeight = clamp(Number(state.ui.editorHeight) || UI_DEFAULTS.editorHeight, editorBounds.min, editorBounds.max);

    elements.workspaceShell.classList.toggle("sidebar-collapsed", state.ui.sidebarCollapsed);
    elements.workspaceShell.style.setProperty("--sidebar-width", `${state.ui.sidebarWidth}px`);

    elements.contentArea.classList.toggle("editor-collapsed", state.ui.editorCollapsed);
    elements.contentArea.style.setProperty(
        "--editor-height",
        `${state.ui.editorCollapsed ? UI_LIMITS.collapsedEditorHeight : state.ui.editorHeight}px`
    );

    updateLayoutButtons();
    updateContentAreaState();

    if (persist) {
        saveUiPreferences();
    }

    requestEditorRefresh();
    requestJsonRefresh();
}

function updateLayoutButtons() {
    const sidebarCollapsed = state.ui.sidebarCollapsed;
    const editorCollapsed = state.ui.editorCollapsed;

    elements.toggleSidebarBtn.title = sidebarCollapsed ? "Expand resources panel" : "Collapse resources panel";
    elements.toggleSidebarBtn.setAttribute("aria-label", elements.toggleSidebarBtn.title);
    elements.toggleSidebarBtn.setAttribute("aria-expanded", String(!sidebarCollapsed));
    elements.toggleSidebarBtn.innerHTML = `<i class="fas fa-angle-double-${sidebarCollapsed ? "right" : "left"}"></i>`;

    elements.toggleEditorBtn.title = editorCollapsed ? "Show query editor" : "Hide query editor";
    elements.toggleEditorBtn.setAttribute("aria-label", elements.toggleEditorBtn.title);
    elements.toggleEditorBtn.setAttribute("aria-expanded", String(!editorCollapsed));
    elements.toggleEditorBtn.innerHTML = editorCollapsed
        ? '<i class="fas fa-expand-alt"></i><span class="ms-1 d-none d-sm-inline">Show Editor</span>'
        : '<i class="fas fa-compress-alt"></i><span class="ms-1 d-none d-sm-inline">Hide Editor</span>';
}

function toggleSidebarCollapsed() {
    state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed;
    applyUiLayout();
}

function toggleEditorCollapsed() {
    state.ui.editorCollapsed = !state.ui.editorCollapsed;
    applyUiLayout();
}

function setupResizeInteractions() {
    setupResizeHandle(elements.sidebarResizeHandle, {
        axis: "x",
        getInitialValue: () => state.ui.sidebarWidth,
        getNextValue: (startValue, delta) => {
            const bounds = getSidebarWidthBounds();
            return clamp(startValue + delta, bounds.min, bounds.max);
        },
        onChange: (value) => {
            state.ui.sidebarCollapsed = false;
            state.ui.sidebarWidth = value;
            applyUiLayout(false);
        },
        onReset: () => {
            state.ui.sidebarCollapsed = false;
            state.ui.sidebarWidth = UI_DEFAULTS.sidebarWidth;
            applyUiLayout();
        }
    });

    setupResizeHandle(elements.editorResizeHandle, {
        axis: "y",
        getInitialValue: () => state.ui.editorHeight,
        getNextValue: (startValue, delta) => {
            const bounds = getEditorHeightBounds();
            return clamp(startValue + delta, bounds.min, bounds.max);
        },
        onChange: (value) => {
            state.ui.editorCollapsed = false;
            state.ui.editorHeight = value;
            applyUiLayout(false);
        },
        onReset: () => {
            state.ui.editorCollapsed = false;
            state.ui.editorHeight = UI_DEFAULTS.editorHeight;
            applyUiLayout();
        }
    });
}

function setupResizeHandle(handle, options) {
    if (!handle) {
        return;
    }

    handle.addEventListener("dblclick", options.onReset);
    handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();

        const startPointer = options.axis === "x" ? event.clientX : event.clientY;
        const startValue = options.getInitialValue();
        const cursor = options.axis === "x" ? "col-resize" : "row-resize";

        handle.classList.add("is-dragging");
        document.body.style.cursor = cursor;
        document.body.style.userSelect = "none";
        handle.setPointerCapture?.(event.pointerId);

        const onPointerMove = (moveEvent) => {
            const currentPointer = options.axis === "x" ? moveEvent.clientX : moveEvent.clientY;
            options.onChange(options.getNextValue(startValue, currentPointer - startPointer));
        };

        const stopDragging = () => {
            handle.classList.remove("is-dragging");
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", stopDragging);
            document.removeEventListener("pointercancel", stopDragging);
            saveUiPreferences();
        };

        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", stopDragging);
        document.addEventListener("pointercancel", stopDragging);
    });
}

function debounce(callback, waitMs) {
    let timeoutId = null;
    return function(...args) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => callback(...args), waitMs);
    };
}
