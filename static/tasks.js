
function showSpinner() {
    const spinner = document.getElementById('spinner');
    if (spinner) {
        spinner.innerHTML = '<span class="spinner"></span>';
    }
}
function showCheckmark() {
    const spinner = document.getElementById('spinner');
    if (spinner) {
        spinner.innerHTML = '<span class="checkmark">&#10004;</span>';
    }
}



let allTasks = [];
let loadedCount = 0;
let projects = {}; // Объект для хранения проектов
let projectsWithMyTasks = new Set(); // Множество для хранения ID проектов, в которых у меня есть задачи
let projectTaskCounts = {}; // Объект для хранения количества задач по проектам
let currentUserData = {}; // Данные о текущем пользователе
let currentMode = 'fromme'; // Текущий режим (fromme или all)
let lastFetchTimestamp = ''; // ISO-время начала последнего запроса
let isUpdating = false; // Флаг, что обновление уже идёт

// Функция для подсчета задач по проектам
function updateProjectTaskCounts() {
    projectTaskCounts = {};
    let tasksWithoutProject = 0;
    let totalTasks = 0;
    
    for (const task of allTasks) {
        if (!task.is_filtered) continue; // Только задачи пользователя
        
        totalTasks++;
        
        const projectId = task.group?.id || null;
        
        if (projectId) {
            if (!projectTaskCounts[projectId]) {
                projectTaskCounts[projectId] = 0;
            }
            projectTaskCounts[projectId]++;
        } else {
            tasksWithoutProject++;
        }
    }
    
    projectTaskCounts['all'] = totalTasks;
    projectTaskCounts['none'] = tasksWithoutProject;
}

// Функция для создания выпадающего списка проектов
function populateProjectsDropdown() {
    const select = document.getElementById('project-filter');
    if (!select) return;
    
    // Сохраняем текущее выбранное значение (если есть)
    const currentValue = select.value;
    
    // Очищаем список, оставляя только первые два опции (все проекты и без проекта)
    while (select.options.length > 2) {
        select.remove(2);
    }
    
    // Обновляем подсчет задач
    updateProjectTaskCounts();
    
    // Обновляем текст первых двух опций с количеством задач
    if (select.options.length >= 2) {
        select.options[0].textContent = `Все проекты (${projectTaskCounts['all'] || 0})`;
        select.options[1].textContent = `Без проекта (${projectTaskCounts['none'] || 0})`;
    }
    
    // Добавляем проекты в выпадающий список, но только те, в которых у пользователя есть задачи
    const projectIds = Object.keys(projects)
        .filter(id => projectsWithMyTasks.has(id)) // Только проекты с моими  задачами
        .sort((a, b) => projects[a].name.localeCompare(projects[b].name, 'ru'));
    
    for (const projectId of projectIds) {
        const projectName = projects[projectId].name;
        const taskCount = projectTaskCounts[projectId] || 0;
        const option = document.createElement('option');
        option.value = projectId;
        option.textContent = `${projectName} (${taskCount})`;
        select.appendChild(option);
    }
    
    // Восстанавливаем выбранное значение, если оно всё ещё существует в списке
    if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
        select.value = currentValue;
    } else {
        // Если выбранное значение больше не существует, устанавливаем "все проекты"
        select.value = 'all';
    }
}

// Функция для рендеринга задач с учетом фильтров
function renderGroupsFiltered() {
    const viewMode = document.getElementById('view-mode');
    const currentViewMode = viewMode ? viewMode.value : 'list';
    
    if (currentViewMode === 'inventory') {
        renderInventory();
    } else {
        renderList();
    }
}

// Фильтрация задач по текущим настройкам (проект, завершённые)
function getFilteredTasks() {
    const statusSelect = document.getElementById('status-filter');
    const statusMode = statusSelect ? statusSelect.value : 'active';
    
    const projectSelect = document.getElementById('project-filter');
    const selectedProject = projectSelect ? projectSelect.value : 'all';
    
    const filtered = [];
    for (const task of allTasks) {
        if (!task.is_filtered) continue;
        
        let status = String(task.status);
        if (statusMode === 'active' && status !== '2' && status !== '3' && status !== '6') continue;
        if (statusMode === 'control' && status !== '2' && status !== '3' && status !== '4' && status !== '6') continue;
        
        if (selectedProject !== 'all') {
            const taskProjectId = task.group?.id || null;
            if (selectedProject === 'none') {
                if (taskProjectId) continue;
            } else if (taskProjectId !== selectedProject) {
                continue;
            }
        }
        filtered.push(task);
    }
    return filtered;
}

// Группировка задач по ответственному
function groupByResponsible(tasks) {
    const byResponsible = {};
    for (const task of tasks) {
        let key = (task.responsible || 'Не назначен') + '|' + (task.responsible_icon || '');
        if (!byResponsible[key]) {
            byResponsible[key] = {name: task.responsible, icon: task.responsible_icon, tasks: []};
        }
        byResponsible[key].tasks.push({
            title: task.title,
            date: task.deadline || '',
            status: task.status,
            id: task.id || '',
            version: task.version || 0
        });
    }
    return Object.values(byResponsible).sort((a, b) => {
        if (b.tasks.length !== a.tasks.length) return b.tasks.length - a.tasks.length;
        return (a.name || '').localeCompare(b.name || '', 'ru');
    });
}

// Создание DOM-элемента для одного элемента задачи
function createTaskLi(t) {
    let li = document.createElement('li');
    
    let taskLink = document.createElement('a');
    if (currentUserData.baseUrl && currentUserData.id && t.id) {
        taskLink.href = `${currentUserData.baseUrl}/company/personal/user/${currentUserData.id}/tasks/task/view/${t.id}/`;
        taskLink.target = "_blank";
        taskLink.textContent = t.title;
        taskLink.classList.add('task-link');
        li.appendChild(taskLink);
    } else {
        li.textContent = t.title;
    }
    
    if (t.date) {
        try {
            const arrow = document.createElement('span');
            arrow.textContent = '→';
            arrow.className = 'task-arrow';
            li.appendChild(arrow);
            
            const dateObj = new Date(t.date);
            if (!isNaN(dateObj.getTime())) {
                const day = String(dateObj.getDate()).padStart(2, '0');
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const year = dateObj.getFullYear();
                const formattedDate = `${day}.${month}.${year}`;
                
                const deadline = document.createElement('span');
                deadline.textContent = formattedDate;
                deadline.className = 'task-deadline';
                
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const taskDate = new Date(dateObj);
                taskDate.setHours(0, 0, 0, 0);
                
                const isCompleted = t.status === '4' || t.status === 4 || t.status === '5' || t.status === 5;
                const isOverdue = taskDate <= today && !isCompleted;
                
                if (isOverdue) {
                    li.classList.add('task-overdue');
                    arrow.classList.add('task-overdue');
                    deadline.classList.add('task-overdue');
                    const link = li.querySelector('.task-link');
                    if (link) link.classList.add('task-overdue');
                }
                
                li.appendChild(deadline);
            }
        } catch (e) {}
    }
    
    if (t.status === '4' || t.status === 4) {
        li.classList.add('task-status-4');
    } else if (t.status === '5' || t.status === 5) {
        li.classList.add('task-status-5');
    }
    
    return li;
}

// Рендер группы задач (заголовок + список) в указанный контейнер
function renderGroupInto(container, group) {
    let iconHtml = '';
    if (group.icon) {
        iconHtml = `<img src="${group.icon}" alt="" style="width:22px;height:22px;border-radius:50%;vertical-align:middle;margin-right:6px;">`;
    }
    let header = document.createElement('div');
    header.innerHTML = `<p style="margin-bottom:2px;margin-top:12px;"><b>${iconHtml}${group.name}</b></p>`;
    container.appendChild(header);
    let ul = document.createElement('ul');
    ul.style.marginTop = '0px';
    ul.style.marginBottom = '8px';
    group.tasks.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const t of group.tasks) {
        ul.appendChild(createTaskLi(t));
    }
    container.appendChild(ul);
}

// Режим "Список" (стандартный)
function renderList() {
    const filtered = getFilteredTasks();
    document.getElementById('count').textContent = filtered.length;
    const tasksDiv = document.getElementById('tasks');
    tasksDiv.innerHTML = '';
    tasksDiv.classList.remove('inventory-columns');
    if (filtered.length === 0) {
        tasksDiv.innerHTML = 'Нет задач';
        return;
    }
    const sortedGroups = groupByResponsible(filtered);
    for (const group of sortedGroups) {
        renderGroupInto(tasksDiv, group);
    }
}

// Режим "Инвентаризация" (две колонки по версиям)
function renderInventory() {
    const filtered = getFilteredTasks();
    document.getElementById('count').textContent = filtered.length;
    const tasksDiv = document.getElementById('tasks');
    tasksDiv.innerHTML = '';
    tasksDiv.classList.add('inventory-columns');
    
    if (filtered.length === 0) {
        tasksDiv.innerHTML = 'Нет задач';
        return;
    }
    
    // Определяем MAX
    const versions = filtered.map(t => t.version || 0);
    const uniqueVersions = new Set(versions);
    let MAX;
    if (uniqueVersions.size <= 1) {
        // Все одинаковые — MAX = текущая версия + 1
        MAX = (versions[0] || 0) + 1;
    } else {
        MAX = Math.max(...versions);
    }
    
    const leftTasks = filtered.filter(t => (t.version || 0) < MAX);
    const rightTasks = filtered.filter(t => (t.version || 0) === MAX);
    
    // Левая колонка
    const leftCol = document.createElement('div');
    leftCol.className = 'inventory-col';
    const leftTitle = document.createElement('h3');
    leftTitle.className = 'inventory-col-title';
    leftTitle.textContent = `Версия ${MAX - 1}`;
    leftCol.appendChild(leftTitle);
    if (leftTasks.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'Нет задач';
        leftCol.appendChild(empty);
    } else {
        const leftGroups = groupByResponsible(leftTasks);
        for (const group of leftGroups) {
            renderGroupInto(leftCol, group);
        }
    }
    
    // Правая колонка
    const rightCol = document.createElement('div');
    rightCol.className = 'inventory-col';
    const rightTitle = document.createElement('h3');
    rightTitle.className = 'inventory-col-title';
    rightTitle.textContent = `Версия ${MAX}`;
    rightCol.appendChild(rightTitle);
    if (rightTasks.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'Нет задач';
        rightCol.appendChild(empty);
    } else {
        const rightGroups = groupByResponsible(rightTasks);
        for (const group of rightGroups) {
            renderGroupInto(rightCol, group);
        }
    }
    
    tasksDiv.appendChild(leftCol);
    tasksDiv.appendChild(rightCol);
}

// Загрузка задач с сервера (внутренняя функция, возвращает данные)
async function fetchTasksFromServer(updateFrom) {
    let newTasks = [];
    let newProjects = {};
    let newProjectsWithMyTasks = new Set();
    let count = 0;

    let url = `/api/tasks?mode=${currentMode}`;
    if (updateFrom) {
        url += `&update_from=${encodeURIComponent(updateFrom)}`;
    }
    let response = await fetch(url);
    if (!response.ok) throw new Error('Ошибка загрузки задач');

    let reader = response.body.getReader();
    let decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        let lines = buffer.split('\n');
        buffer = lines.pop();
        for (let line of lines) {
            if (!line.trim()) continue;
            try {
                let task = JSON.parse(line);
                newTasks.push(task);
                if (task.group && task.group.id && task.group.name) {
                    const projectId = task.group.id;
                    if (!newProjects[projectId]) {
                        newProjects[projectId] = {
                            id: projectId,
                            name: task.group.name,
                            image: task.group.image || ''
                        };
                    }
                    if (task.is_filtered) {
                        newProjectsWithMyTasks.add(projectId);
                    }
                }
                count++;
                document.getElementById('loaded').textContent = count;
            } catch (e) {
                // ignore parse errors
            }
        }
    }
    return {newTasks, newProjects, newProjectsWithMyTasks, count};
}

// Применить загруженные данные и обновить UI
function applyTaskData(data) {
    allTasks = data.newTasks;
    projects = data.newProjects;
    projectsWithMyTasks = data.newProjectsWithMyTasks;
    loadedCount = data.count;
    document.getElementById('loaded').textContent = loadedCount;
    updateProjectTaskCounts();
    populateProjectsDropdown();
    renderGroupsFiltered();
}

// Функция для загрузки задач с сервера (первоначальная)
async function loadTasks() {
    if (isUpdating) return;
    isUpdating = true;
    showSpinner();
    allTasks = [];
    loadedCount = 0;
    projects = {};
    projectsWithMyTasks.clear();
    projectTaskCounts = {};
    try {
        lastFetchTimestamp = new Date().toISOString();
        const data = await fetchTasksFromServer();
        applyTaskData(data);
        showCheckmark();
    } catch(e) {
        document.getElementById('tasks').innerHTML = 'Ошибка: ' + e;
        showSpinner();
    } finally {
        isUpdating = false;
    }
}

// Функция обновления задач без очистки текущего списка
async function refreshTasks() {
    if (isUpdating) return;
    isUpdating = true;
    showSpinner();
    try {
        lastFetchTimestamp = new Date().toISOString();
        const data = await fetchTasksFromServer();
        applyTaskData(data);
        showCheckmark();
    } catch(e) {
        showCheckmark();
    } finally {
        isUpdating = false;
    }
}

// Лайтовое обновление: загружает только изменённые задачи и обновляет их в списке
async function lightRefresh() {
    if (isUpdating) return;
    if (!lastFetchTimestamp) {
        // Если нет предыдущего запроса, делаем полное обновление
        return refreshTasks();
    }
    isUpdating = true;
    showSpinner();
    try {
        const prevTimestamp = lastFetchTimestamp;
        lastFetchTimestamp = new Date().toISOString();
        const data = await fetchTasksFromServer(prevTimestamp);

        // В режиме инвентаризации присваиваем изменённым задачам текущую версию
        const viewMode = document.getElementById('view-mode');
        if (viewMode && viewMode.value === 'inventory' && data.newTasks.length > 0) {
            // Определяем MAX версию по всем задачам (включая уже загруженные)
            const allVersions = allTasks.map(t => t.version || 0).concat(data.newTasks.map(t => t.version || 0));
            const uniqueVersions = new Set(allVersions);
            let MAX;
            if (uniqueVersions.size <= 1) {
                MAX = (allVersions[0] || 0) + 1;
            } else {
                MAX = Math.max(...allVersions);
            }
            // Собираем задачи для обновления версии
            const tasksToUpdate = data.newTasks.map(t => ({
                id: t.id,
                tags: t.tags || ''
            }));
            try {
                await fetch('/api/setversion', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({tasks: tasksToUpdate, version: MAX})
                });
                // Обновляем version у загруженных задач локально
                for (const t of data.newTasks) {
                    t.version = MAX;
                }
            } catch (e) {
                // ignore setversion errors
            }
        }

        // Обновляем или добавляем изменённые задачи в allTasks
        for (const updatedTask of data.newTasks) {
            const idx = allTasks.findIndex(t => t.id === updatedTask.id);
            if (idx !== -1) {
                allTasks[idx] = updatedTask;
            } else {
                allTasks.push(updatedTask);
            }
        }

        // Обновляем проекты
        for (const [pid, proj] of Object.entries(data.newProjects)) {
            projects[pid] = proj;
        }
        for (const pid of data.newProjectsWithMyTasks) {
            projectsWithMyTasks.add(pid);
        }

        loadedCount = allTasks.length;
        document.getElementById('loaded').textContent = loadedCount;
        updateProjectTaskCounts();
        populateProjectsDropdown();
        renderGroupsFiltered();

        showCheckmark();
    } catch(e) {
        showCheckmark();
    } finally {
        isUpdating = false;
    }
}


// Получить данные о текущем пользователе с сервера
async function loadUser() {
    try {
        let resp = await fetch('/api/user');
        if (!resp.ok) return;
        let user = await resp.json();
        // Сохраняем информацию о пользователе для генерации ссылок на задачи
        currentUserData = user;
        
        // Показываем кнопку создания задачи
        const addBtn = document.getElementById('btn-add-task');
        if (addBtn && user.baseUrl && user.id) {
            addBtn.style.display = '';
            addBtn.onclick = () => {
                window.open(`${user.baseUrl}/company/personal/user/${user.id}/tasks/task/edit/0/`, '_blank');
            };
        }
        
        const avatar = document.getElementById('user-avatar');
        if (avatar) {
            let html = '';
            if (user.icon) {
                html += `<img src="${user.icon}" alt="" style="width:22px;height:22px;border-radius:50%;vertical-align:middle;">`;
            }
            html += `<span>${user.name || ''}</span>`;
            avatar.innerHTML = html;
        }
    } catch {}
}


document.addEventListener('DOMContentLoaded', () => {
    // Получаем параметр mode из URL
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    
    // Устанавливаем режим на основе параметра URL
    if (modeParam === 'all') {
        currentMode = 'all';
    } else {
        currentMode = 'fromme'; // По умолчанию "Поручил" (fromme)
    }
    
    loadUser();
    
    // Установка режима в dropdown
    const modeSelect = document.getElementById('mode-filter');
    if (modeSelect) {
        modeSelect.value = currentMode;
        modeSelect.addEventListener('change', () => {
            currentMode = modeSelect.value;
            // Обновляем URL и перезагружаем задачи
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('mode', currentMode);
            window.history.pushState({}, '', newUrl);
            loadTasks();
        });
    }
    
    // Обработчик фильтра по статусу задач
    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            renderGroupsFiltered();
        });
    }
    
    // Установка обработчика для выпадающего списка проектов
    const projectSelect = document.getElementById('project-filter');
    if (projectSelect) {
        projectSelect.addEventListener('change', () => {
            renderGroupsFiltered();
        });
    }
    
    // Установка обработчика для переключения режима отображения
    const viewModeSelect = document.getElementById('view-mode');
    if (viewModeSelect) {
        viewModeSelect.addEventListener('change', () => {
            renderGroupsFiltered();
        });
    }
    
    // Load tasks after setting up the controls
    loadTasks();
    
    // Обработчик кнопки обновления задач
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => refreshTasks());
    }
    
    // Лайтовое обновление при возврате на вкладку
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            lightRefresh();
        }
    });
});
