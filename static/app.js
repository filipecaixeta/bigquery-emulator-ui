const state = {
    activeTab: 'info',
    projects: [],
    expandedProjects: [],
    projectDatasets: {},
    expandedDatasets: [],
    datasetTables: {},
    currentProject: '',
    currentDataset: '',
    currentTable: '',
    tableSchema: [],
    tableMetadata: {},
    query: '',
    queryResults: null,
    isRunningQuery: false,
    error: null,
    cmEditor: null,
    cmJson: null
};

const elements = {
    projectTree: document.getElementById('projectTree'),
    refreshResourcesBtn: document.getElementById('refreshResourcesBtn'),
    queryEditorCard: document.getElementById('queryEditorCard'),
    resultsCard: document.getElementById('resultsCard'),
    queryTitle: document.getElementById('queryTitle'),
    runQueryBtn: document.getElementById('runQueryBtn'),
    formatQueryBtn: document.getElementById('formatQueryBtn'),
    runQueryBtnText: document.getElementById('runQueryBtnText'),
    infoTab: document.getElementById('infoTab'),
    resultsTab: document.getElementById('resultsTab'),
    jsonTab: document.getElementById('jsonTab'),
    infoTabContent: document.getElementById('infoTabContent'),
    resultsTabContent: document.getElementById('resultsTabContent'),
    jsonTabContent: document.getElementById('jsonTabContent'),
    queryResultsContainer: document.getElementById('queryResultsContainer'),
    noResultsMessage: document.getElementById('noResultsMessage'),
    resultCount: document.getElementById('resultCount'),
    queryResultsHeader: document.getElementById('queryResultsHeader'),
    queryResultsBody: document.getElementById('queryResultsBody'),
    schemaTableBody: document.getElementById('schemaTableBody'),
    jsonView: document.getElementById('jsonView'),
    tableFullName: document.getElementById('tableFullName'),
    tableDescription: document.getElementById('tableDescription'),
    tableNumRows: document.getElementById('tableNumRows'),
    tableSize: document.getElementById('tableSize'),
    tableType: document.getElementById('tableType'),
    tableLocation: document.getElementById('tableLocation'),
    tableCreated: document.getElementById('tableCreated'),
    tableModified: document.getElementById('tableModified')
};

document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    loadProjects();
    initJsonMirror();
});

function setupEventListeners() {
    elements.runQueryBtn.addEventListener('click', runQuery);
    elements.formatQueryBtn.addEventListener('click', formatQuery);
    elements.refreshResourcesBtn.addEventListener('click', refreshResources);
    
    elements.infoTab.addEventListener('click', function(e) {
        e.preventDefault();
        switchTab('info');
    });
    
    elements.resultsTab.addEventListener('click', function(e) {
        e.preventDefault();
        switchTab('results');
    });

    elements.jsonTab.addEventListener('click', function(e) {
        e.preventDefault();
        switchTab('json');
    });
}

function switchTab(tabName) {
    state.activeTab = tabName;
    
    if (tabName === 'info') {
        elements.infoTab.classList.add('active');
        elements.resultsTab.classList.remove('active');
        elements.jsonTab.classList.remove('active');
        elements.infoTabContent.style.display = 'block';
        elements.resultsTabContent.style.display = 'none';
        elements.jsonTabContent.style.display = 'none';
    } else if (tabName === 'results') {
        elements.infoTab.classList.remove('active');
        elements.resultsTab.classList.add('active');
        elements.jsonTab.classList.remove('active');
        elements.infoTabContent.style.display = 'none';
        elements.resultsTabContent.style.display = 'block';
        elements.jsonTabContent.style.display = 'none';
        
        if (state.cmEditor) {
            setTimeout(() => state.cmEditor.refresh(), 10);
        }
    } else if (tabName === 'json') {
        elements.infoTab.classList.remove('active');
        elements.resultsTab.classList.remove('active');
        elements.jsonTab.classList.add('active');
        elements.infoTabContent.style.display = 'none';
        elements.resultsTabContent.style.display = 'none';
        elements.jsonTabContent.style.display = 'block';
        
        if (state.cmJson) {
            setTimeout(() => state.cmJson.refresh(), 10);
        }
    }
}

async function loadProjects() {
    try {
        const response = await axios.get('/api/projects');
        state.projects = response.data;
        renderProjects();
    } catch (error) {
        console.error('Error loading projects:', error);
        state.error = 'Failed to load projects';
    }
}

function renderProjects() {
    elements.projectTree.innerHTML = '';
    
    state.projects.forEach(project => {
        const li = document.createElement('li');
        
        const span = document.createElement('span');
        span.className = 'tree-folder';
        span.addEventListener('click', () => toggleProject(project));
        
        const icon = document.createElement('i');
        icon.className = state.expandedProjects.includes(project) ? 
                         'fas fa-folder-open' : 'fas fa-folder';
        
        span.appendChild(icon);
        span.appendChild(document.createTextNode(' ' + project));
        li.appendChild(span);
        
        if (state.expandedProjects.includes(project)) {
            const ul = document.createElement('ul');
            ul.className = 'nested';
            
            const datasets = state.projectDatasets[project] || [];
            datasets.forEach(dataset => {
                const datasetLi = createDatasetElement(project, dataset);
                ul.appendChild(datasetLi);
            });
            
            li.appendChild(ul);
        }
        
        elements.projectTree.appendChild(li);
    });
}

function createDatasetElement(project, dataset) {
    const li = document.createElement('li');
    
    const span = document.createElement('span');
    span.className = 'tree-folder';
    span.addEventListener('click', () => toggleDataset(project, dataset));
    
    const isExpanded = isDatasetExpanded(project, dataset);
    const icon = document.createElement('i');
    icon.className = isExpanded ? 'fas fa-folder-open' : 'fas fa-folder';
    
    span.appendChild(icon);
    span.appendChild(document.createTextNode(' ' + dataset));
    li.appendChild(span);
    
    if (isExpanded) {
        const ul = document.createElement('ul');
        ul.className = 'nested';
        
        const key = `${project}-${dataset}`;
        const tables = state.datasetTables[key] || [];
        
        tables.forEach(table => {
            const tableLi = document.createElement('li');
            const tableSpan = document.createElement('span');
            tableSpan.className = 'tree-item';
            tableSpan.addEventListener('click', () => selectTable(project, dataset, table));
            
            const tableIcon = document.createElement('i');
            tableIcon.className = 'fas fa-table';
            
            tableSpan.appendChild(tableIcon);
            tableSpan.appendChild(document.createTextNode(' ' + table));
            tableLi.appendChild(tableSpan);
            ul.appendChild(tableLi);
        });
        
        li.appendChild(ul);
    }
    
    return li;
}

async function toggleProject(project) {
    if (state.expandedProjects.includes(project)) {
        state.expandedProjects = state.expandedProjects.filter(p => p !== project);
    } else {
        state.expandedProjects.push(project);
        await loadDatasets(project);
    }
    renderProjects();
}

async function loadDatasets(project) {
    if (!state.projectDatasets[project]) {
        try {
            const response = await axios.get(`/api/projects/${project}/datasets`);
            state.projectDatasets[project] = response.data;
        } catch (error) {
            console.error(`Error loading datasets for project ${project}:`, error);
        }
    }
}

async function toggleDataset(project, dataset) {
    const key = `${project}-${dataset}`;
    
    if (state.expandedDatasets.includes(key)) {
        state.expandedDatasets = state.expandedDatasets.filter(k => k !== key);
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
    if (!state.datasetTables[key]) {
        try {
            const response = await axios.get(`/api/projects/${project}/datasets/${dataset}/tables`);
            state.datasetTables[key] = response.data;
        } catch (error) {
            console.error(`Error loading tables for dataset ${dataset}:`, error);
        }
    }
}

async function selectTable(project, dataset, table) {
    state.currentProject = project;
    state.currentDataset = dataset;
    state.currentTable = table;
    state.activeTab = 'info';
    state.tableMetadata = {};
    
    const newQuery = `SELECT * FROM \`${project}.${dataset}.${table}\` LIMIT 100`;
    state.query = newQuery;
    
    elements.queryTitle.textContent = `Query: ${project}.${dataset}.${table}`;
    elements.queryEditorCard.style.display = 'block';
    elements.resultsCard.style.display = 'block';
    
    switchTab('info');
    
    try {
        const response = await axios.get(`/api/projects/${project}/datasets/${dataset}/tables/${table}/schema`);
        state.tableSchema = response.data.schema;
        state.tableMetadata = response.data;
        
        renderTableInfo();
        initCodeMirror();
    } catch (error) {
        console.error(`Error loading schema for table ${table}:`, error);
    }
}

function initCodeMirror() {
    const editorElem = document.getElementById('codemirror-editor');
    if (!editorElem) return;
    
    editorElem.innerHTML = '';
    
    try {
        state.cmEditor = CodeMirror(editorElem, {
            value: state.query || '',
            mode: 'text/x-sql',
            theme: 'eclipse',
            lineNumbers: true,
            indentWithTabs: false,
            smartIndent: true,
            lineWrapping: true,
            matchBrackets: true,
            autoRefresh: true,
            tabSize: 2,
            indentUnit: 2,
            viewportMargin: Infinity,
            extraKeys: {
                "Ctrl-Space": "autocomplete",
                "Ctrl-Enter": runQuery,
                "Cmd-Enter": runQuery,
                "Alt-F": formatQuery,
                "Tab": function(cm) {
                    if (cm.somethingSelected()) {
                        cm.indentSelection("add");
                    } else {
                        cm.replaceSelection("  ", "end", "+input");
                    }
                }
            }
        });

        state.cmEditor.on('change', (cm) => {
            state.query = cm.getValue();
        });
        
        setTimeout(() => {
            if (state.cmEditor) {
                state.cmEditor.refresh();
            }
        }, 50);
    } catch (error) {
        console.error("Error initializing CodeMirror:", error);
    }
}

function initJsonMirror() {
    const jsonTextArea = document.getElementById('jsonView');
    if (jsonTextArea) {
        state.cmJson = CodeMirror.fromTextArea(jsonTextArea, {
            mode: { name: "javascript", json: true },
            readOnly: true,
            theme: 'eclipse',
            lineNumbers: true,
            viewportMargin: Infinity,
            matchBrackets: true, 
            autoCloseBrackets: true, 
            foldGutter: true, 
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"], 
        });
        setTimeout(() => state.cmJson.refresh(), 10);
    }
}

function formatQuery() {
    if (state.cmEditor) {
        try {
            const currentQuery = state.cmEditor.getValue();
            if (!currentQuery.trim()) return;
            
            const formattedSql = sqlFormatter.format(currentQuery, {
                language: 'bigquery',
                uppercase: true
            });
            state.cmEditor.setValue(formattedSql);
            state.query = formattedSql;
        } catch (error) {
            console.error('Error formatting SQL:', error);
            alert('Could not format SQL: ' + error.message);
        }
    }
}

async function runQuery() {
    if (!state.cmEditor) {
        console.error("CodeMirror editor not initialized");
        return;
    }
    
    const currentQuery = state.cmEditor.getValue();
    if (!currentQuery.trim()) {
        alert("Please enter a SQL query");
        return;
    }
    
    state.isRunningQuery = true;
    elements.runQueryBtnText.textContent = "Running...";
    elements.runQueryBtn.disabled = true;
    elements.formatQueryBtn.disabled = true;
    
    try {
        const response = await axios.post('/api/query', { query: currentQuery });
        state.queryResults = response.data;
        renderQueryResults();
        
        if(state.cmJson) {
            state.cmJson.setValue(JSON.stringify(state.queryResults.rows, null, 2));
        }
        switchTab('results');
    } catch (error) {
        console.error('Error running query:', error);
        const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
        alert(`Query error: ${errorMessage}`);
    } finally {
        state.isRunningQuery = false;
        elements.runQueryBtnText.textContent = "Run Query";
        elements.runQueryBtn.disabled = false;
        elements.formatQueryBtn.disabled = false;
    }
}

function renderTableInfo() {
    elements.tableFullName.textContent = state.tableMetadata.fullyQualifiedName || '';
    elements.tableDescription.textContent = state.tableMetadata.description || 'No description';
    elements.tableNumRows.textContent = state.tableMetadata.numRows ? 
                                        state.tableMetadata.numRows.toLocaleString() : 'Unknown';
    elements.tableSize.textContent = formatBytes(state.tableMetadata.numBytes);
    elements.tableType.textContent = state.tableMetadata.type || 'Standard';
    elements.tableLocation.textContent = state.tableMetadata.location || '';
    elements.tableCreated.textContent = formatDate(state.tableMetadata.creationTime);
    elements.tableModified.textContent = formatDate(state.tableMetadata.lastModified);
    
    elements.schemaTableBody.innerHTML = '';
    state.tableSchema.forEach(field => {
        const tr = document.createElement('tr');
        
        const nameTd = document.createElement('td');
        nameTd.textContent = field.name;
        tr.appendChild(nameTd);
        
        const typeTd = document.createElement('td');
        typeTd.textContent = field.type;
        tr.appendChild(typeTd);
        
        const modeTd = document.createElement('td');
        modeTd.textContent = field.mode;
        tr.appendChild(modeTd);
        
        const descTd = document.createElement('td');
        descTd.textContent = field.description || '-';
        tr.appendChild(descTd);
        
        elements.schemaTableBody.appendChild(tr);
    });
}

function renderQueryResults() {
    if (!state.queryResults) {
        elements.noResultsMessage.style.display = 'block';
        elements.queryResultsContainer.style.display = 'none';
        elements.resultCount.style.display = 'none';
        return;
    }
    
    elements.noResultsMessage.style.display = 'none';
    elements.queryResultsContainer.style.display = 'block';
    elements.resultCount.style.display = 'inline';
    elements.resultCount.textContent = state.queryResults.total_rows || '0';
    
    elements.queryResultsHeader.innerHTML = '';
    const headerRow = document.createElement('tr');
    
    state.queryResults.columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        headerRow.appendChild(th);
    });
    
    elements.queryResultsHeader.appendChild(headerRow);
    
    elements.queryResultsBody.innerHTML = '';
    
    state.queryResults.rows.forEach(row => {
        const tr = document.createElement('tr');
        
        state.queryResults.columns.forEach(column => {
            const td = document.createElement('td');
            let value = row[column] !== null ? row[column] : 'NULL';
            if (Array.isArray(value) || (value !== undefined && value !== null && value.constructor == Object)) {
                const pre = document.createElement('pre');
                pre.textContent = JSON.stringify(value, null, 2);
                td.appendChild(pre);
            } else {
                td.textContent = value;
            }
            tr.appendChild(td);
        });
        
        elements.queryResultsBody.appendChild(tr);
    });
}

function formatBytes(bytes) {
    if (bytes === undefined || bytes === null) return 'Unknown';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    if (i === 0) return bytes + ' ' + sizes[i];
    
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleString();
    } catch (e) {
        return dateString;
    }
}

async function refreshResources() {
    const button = elements.refreshResourcesBtn;
    button.disabled = true;
    const icon = button.querySelector('i');
    icon.classList.add('fa-spin');

    try {
        // Reset state
        state.expandedProjects = [];
        state.projectDatasets = {};
        state.expandedDatasets = [];
        state.datasetTables = {};
        
        // Reload projects
        await loadProjects();
    } catch (error) {
        console.error('Error refreshing resources:', error);
        alert('Failed to refresh resources');
    } finally {
        button.disabled = false;
        icon.classList.remove('fa-spin');
    }
}
