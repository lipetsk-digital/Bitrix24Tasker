
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

function renderGroupsFiltered() {
    const checkbox = document.getElementById('show-completed');
    const showCompleted = checkbox ? checkbox.checked : false;
    
    const projectSelect = document.getElementById('project-filter');
    const selectedProject = projectSelect ? projectSelect.value : 'all';
    
    let count = 0;
    const byResponsible = {};
    
    for (const task of allTasks) {
        if (!task.is_filtered) continue;
        
        // Фильтрация завершённых и ожидающих контроля задач
        // Не показываем задачи со статусами 4 (Ожидает контроля) и 5 (Завершена), если галочка снята
        let status = String(task.status);
        if (!showCompleted && (status === '4' || status === '5')) continue;
        
        // Фильтрация по проекту
        if (selectedProject !== 'all') {
            const taskProjectId = task.group?.id || null;
            
            // Если выбран "Без проекта", показываем только задачи без проекта
            if (selectedProject === 'none') {
                if (taskProjectId) continue;
            } 
            // Иначе показываем задачи только из выбранного проекта
            else if (taskProjectId !== selectedProject) {
                continue;
            }
        }
        count++;
        let key = (task.responsible || 'Не назначен') + '|' + (task.responsible_icon || '');
        if (!byResponsible[key]) {
            byResponsible[key] = {name: task.responsible, icon: task.responsible_icon, tasks: []};
        }
    byResponsible[key].tasks.push({
        title: task.title, 
        date: task.deadline || '', 
        status: task.status,
        id: task.id || ''
    });
    }
    document.getElementById('count').textContent = count;
    const tasksDiv = document.getElementById('tasks');
    tasksDiv.innerHTML = '';
    if (count === 0) {
        tasksDiv.innerHTML = 'Нет задач';
        return;
    }
    const sortedGroups = Object.values(byResponsible).sort((a, b) => {
        if (b.tasks.length !== a.tasks.length) {
            return b.tasks.length - a.tasks.length;
        }
        return (a.name || '').localeCompare(b.name || '', 'ru');
    });
    for (const group of sortedGroups) {
        let iconHtml = '';
        if (group.icon) {
            iconHtml = `<img src="${group.icon}" alt="" style="width:22px;height:22px;border-radius:50%;vertical-align:middle;margin-right:6px;">`;
        }
        let header = document.createElement('div');
        header.innerHTML = `<p style="margin-bottom:2px;margin-top:12px;"><b>${iconHtml}${group.name}</b></p>`;
        tasksDiv.appendChild(header);
        let ul = document.createElement('ul');
        ul.style.marginTop = '0px';
        ul.style.marginBottom = '8px';
        group.tasks.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        for (const t of group.tasks) {
            let li = document.createElement('li');
            
            // Создаем ссылку на задачу
            let taskLink = document.createElement('a');
            
            // Формируем URL задачи по шаблону: протокол://домен/company/personal/user/ID_пользователя/tasks/task/view/ID_задачи/
            if (currentUserData.baseUrl && currentUserData.id && t.id) {
                taskLink.href = `${currentUserData.baseUrl}/company/personal/user/${currentUserData.id}/tasks/task/view/${t.id}/`;
                taskLink.target = "_blank"; // Открывать в новой вкладке
                taskLink.textContent = t.title;
                taskLink.classList.add('task-link'); // Применяем стиль для ссылок
                li.appendChild(taskLink);
            } else {
                // Если данные для ссылки недоступны, просто выводим текст
                li.textContent = t.title;
            }
            
            // Добавляем стрелочку и срок выполнения, если он есть
            if (t.date) {
                try {
                    // Добавляем стрелочку
                    const arrow = document.createElement('span');
                    arrow.textContent = '→';
                    arrow.className = 'task-arrow';
                    li.appendChild(arrow);
                    
                    // Преобразуем дату из формата ISO в формат DD.MM.YYYY
                    const dateObj = new Date(t.date);
                    if (!isNaN(dateObj.getTime())) {
                        const day = String(dateObj.getDate()).padStart(2, '0');
                        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const year = dateObj.getFullYear();
                        const formattedDate = `${day}.${month}.${year}`;
                        
                        const deadline = document.createElement('span');
                        deadline.textContent = formattedDate;
                        deadline.className = 'task-deadline';
                        
                        // Проверяем, не просрочена ли задача
                        // Задача просрочена, если:
                        // 1. Срок выполнения меньше или равен текущей дате
                        // 2. Задача не имеет статусов 4 или 5 (не завершена и не на контроле)
                        const today = new Date();
                        today.setHours(0, 0, 0, 0); // Сбрасываем время для корректного сравнения дат
                        const taskDate = new Date(dateObj);
                        taskDate.setHours(0, 0, 0, 0);
                        
                        const isCompleted = t.status === '4' || t.status === 4 || t.status === '5' || t.status === 5;
                        const isOverdue = taskDate <= today && !isCompleted;
                        
                        if (isOverdue) {
                            // Если задача просрочена, делаем её красной
                            li.classList.add('task-overdue');
                            arrow.classList.add('task-overdue');
                            deadline.classList.add('task-overdue');
                            // Также добавляем класс к ссылке задачи, если она есть
                            const taskLink = li.querySelector('.task-link');
                            if (taskLink) {
                                taskLink.classList.add('task-overdue');
                            }
                        }
                        
                        li.appendChild(deadline);
                    }
                } catch (e) {
                    // В случае ошибки парсинга даты - ничего не делаем
                }
            }
            
            // Применяем стили в зависимости от статуса
            if (t.status === '4' || t.status === 4) {
                li.classList.add('task-status-4');
            } else if (t.status === '5' || t.status === 5) {
                li.classList.add('task-status-5');
            }
            
            ul.appendChild(li);
        }
        tasksDiv.appendChild(ul);
    }
}

async function loadTasks() {
    showSpinner();
    allTasks = [];
    loadedCount = 0;
    projects = {};
    projectsWithMyTasks.clear();
    projectTaskCounts = {};
    try {
        let response = await fetch(`/api/tasks?mode=${currentMode}`);
        if (!response.ok) {
            document.getElementById('tasks').innerHTML = 'Ошибка загрузки задач';
            showSpinner();
            return;
        }
        let reader = response.body.getReader();
        let decoder = new TextDecoder();
        let buffer = '';
        while(true) {
            const {done, value} = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, {stream:true});
            let lines = buffer.split('\n');
            buffer = lines.pop();
            for (let line of lines) {
                if (!line.trim()) continue;
                try {
                    let task = JSON.parse(line);
                    allTasks.push(task);
                    
                    // Собираем информацию о проектах
                    if (task.group && task.group.id && task.group.name) {
                        const projectId = task.group.id;
                        if (!projects[projectId]) {
                            projects[projectId] = {
                                id: projectId,
                                name: task.group.name,
                                image: task.group.image || ''
                            };
                        }
                        
                        // Если это задача пользователя (is_filtered = true), добавляем проект в список проектов с задачами пользователя
                        if (task.is_filtered) {
                            projectsWithMyTasks.add(projectId);
                            // Обновляем выпадающий список при обнаружении нового проекта с моими задачами
                            populateProjectsDropdown();
                        }
                    }
                    
                    loadedCount++;
                    document.getElementById('loaded').textContent = loadedCount;
                    renderGroupsFiltered();
                } catch(e) {
                    // ignore parse errors
                }
            }
        }
        showCheckmark();
        // Обновляем подсчет задач по проектам
        updateProjectTaskCounts();
        // Убедимся, что выпадающий список заполнен проектами, где у пользователя есть задачи
        populateProjectsDropdown();
        // After all tasks are loaded, re-render to ensure the list matches the current filters
        renderGroupsFiltered();
    } catch(e) {
        document.getElementById('tasks').innerHTML = 'Ошибка: ' + e;
        showSpinner();
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
    
    // Ensure the checkbox is unchecked initially
    const flag = document.getElementById('show-completed');
    if (flag) {
        flag.checked = false;
        flag.addEventListener('change', () => {
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
    
    // Load tasks after setting up the controls
    loadTasks();
});
