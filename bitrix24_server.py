import os
import requests
from flask import Flask, render_template

app = Flask(__name__)

BITRIX_WEBHOOK = os.environ.get('BITRIX_WEBHOOK')


# Главная страница
@app.route('/')
def index():
    return render_template('index.html')

# API-эндпоинт для потоковой передачи задач
from flask import Response
import json


@app.route('/api/tasks')
def api_tasks():
    if not BITRIX_WEBHOOK:
        return 'BITRIX_WEBHOOK env variable not set', 500
    
    # Получаем параметр режима из query параметров
    from flask import request
    mode = request.args.get('mode', 'fromme')
    update_from = request.args.get('update_from', '')
    
    url = f'{BITRIX_WEBHOOK}tasks.task.list'
    user_url = f'{BITRIX_WEBHOOK}user.current'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    # Получаем сведения о текущем пользователе
    user_resp = requests.get(user_url, headers=headers)
    if user_resp.status_code != 200:
        return Response(json.dumps({'error': 'Bitrix24 user.current error'}), mimetype='text/plain; charset=utf-8')
    user_data = user_resp.json()
    user_id = str(user_data.get('result', {}).get('ID', ''))
    if not user_id:
        return Response(json.dumps({'error': 'Bitrix24 user.current error'}), mimetype='text/plain; charset=utf-8')

    def generate():
        import sys
        import re
        import json as json_module
        page_size = 50
        all_task_ids = set()  # Отслеживаем уникальные задачи по ID
        
        # Определяем какие фильтры применять в зависимости от режима
        filters_to_apply = []
        if mode == 'fromme':
            filters_to_apply = [{'CREATED_BY': user_id}]
        else:  # mode == 'all'
            filters_to_apply = [
                {'CREATED_BY': user_id},
                {'RESPONSIBLE_ID': user_id},
                {'ACCOMPLICE': user_id},
                {'AUDITOR': user_id}
            ]
        
        # Выполняем запросы для каждого фильтра
        for filter_dict in filters_to_apply:
            start = 0
            while True:
                select_fields = ['ID', 'TITLE', 'RESPONSIBLE_ID', 'CREATED_BY', 'DEADLINE', 'CREATED_DATE', 'CHANGED_DATE', 'STATUS', 'CLOSED_DATE', 'GROUP_ID', 'TAGS']
                params = {
                    'start': start,
                    'NAV_PARAMS[nPageSize]': page_size
                }
                for i, field in enumerate(select_fields):
                    params[f'select[{i}]'] = field
                
                # Добавляем фильтр в параметры запроса
                for key, value in filter_dict.items():
                    params[f'filter[{key}]'] = value
                
                # Если задан update_from, добавляем фильтр по дате изменения
                if update_from:
                    from datetime import datetime
                    try:
                        # Парсим ISO-формат из браузера и конвертируем в формат Bitrix24
                        dt = datetime.fromisoformat(update_from.replace('Z', '+00:00'))
                        params['filter[>=CHANGED_DATE]'] = dt.strftime('%Y-%m-%dT%H:%M:%S')
                    except (ValueError, AttributeError):
                        pass
                
                resp = requests.get(url, headers=headers, params=params, stream=True)
                if resp.status_code != 200:
                    yield json.dumps({'error': 'Bitrix24 API error'}) + '\n'
                    break
                
                data = resp.json()
                tasks = data.get('result', {}).get('tasks', [])
                if not tasks:
                    break
                
                for task in tasks:
                    task_id = task.get('id', '') or task.get('ID', '')
                    # Пропускаем задачу, если мы её уже обработали
                    if task_id and task_id not in all_task_ids:
                        all_task_ids.add(task_id)
                        
                        title = task.get('title', 'Без названия')
                        responsible = 'Не назначен'
                        responsible_icon = ''
                        if 'responsible' in task and isinstance(task['responsible'], dict):
                            responsible = task['responsible'].get('name', 'Не назначен')
                            responsible_icon = task['responsible'].get('icon', '')
                            if responsible_icon and responsible_icon.startswith('/'):
                                from urllib.parse import urlparse
                                parsed = urlparse(BITRIX_WEBHOOK)
                                responsible_icon = f"{parsed.scheme}://{parsed.netloc}{responsible_icon}"
                        elif 'responsibleId' in task:
                            responsible = f"ID: {task['responsibleId']}"
                        creator = task.get('creator', {})
                        creator_name = creator.get('name', '')
                        # Получаем данные о группе/проекте задачи, если они есть
                        group_data = None
                        if 'group' in task and isinstance(task['group'], dict):
                            group_data = {
                                'id': task['group'].get('ID') or task['group'].get('id', ''),
                                'name': task['group'].get('NAME') or task['group'].get('name', ''),
                                'image': task['group'].get('IMAGE') or task['group'].get('image', ''),
                                'opened': task['group'].get('OPENED', False) or task['group'].get('opened', False),
                                'membersCount': task['group'].get('MEMBERS_COUNT', 0) or task['group'].get('membersCount', 0)
                            }
                            # Преобразуем относительные ссылки на абсолютные для изображений проектов
                            if group_data['image'] and group_data['image'].startswith('/'):
                                from urllib.parse import urlparse
                                parsed = urlparse(BITRIX_WEBHOOK)
                                group_data['image'] = f"{parsed.scheme}://{parsed.netloc}{group_data['image']}"

                        # Извлекаем номер версии из тэгов вида 'v123' и собираем список тэгов
                        version = 0
                        tags_list = []
                        tags = task.get('tags', {}) or task.get('TAGS', {})
                        if isinstance(tags, dict):
                            tags = tags.values()
                        if isinstance(tags, list):
                            pass  # уже список
                        for tag in tags:
                            tag_title = tag.get('title', '') if isinstance(tag, dict) else str(tag)
                            m = re.fullmatch(r'v(\d+)', tag_title, re.IGNORECASE)
                            if ',' not in tag_title and not m:
                                tags_list.append(tag_title)
                            if m:
                                version = max(version, int(m.group(1)))

                        yield json.dumps({
                            'title': title,
                            'responsible': responsible,
                            'responsible_icon': responsible_icon,
                            'creator': creator_name,
                            'is_filtered': True,
                            'deadline': task.get('deadline', ''),
                            'createdDate': task.get('createdDate', ''),
                            'status': task.get('status', ''),
                            'closed': task.get('closed', False),
                            'group': group_data,
                            'id': task.get('id', '') or task.get('ID', ''),
                            'version': version,
                            'tags': ','.join(tags_list),
                            'changedDate': task.get('changedDate', '') or task.get('CHANGED_DATE', '')
                        }, ensure_ascii=False) + '\n'
                        sys.stdout.flush()
                
                start += page_size
    return Response(generate(), mimetype='text/plain; charset=utf-8')

# API для получения текущего пользователя Bitrix24
@app.route('/api/user')
def api_user():
    if not BITRIX_WEBHOOK:
        return {'error': 'BITRIX_WEBHOOK env variable not set'}, 500
    user_url = f'{BITRIX_WEBHOOK}user.current'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    resp = requests.get(user_url, headers=headers)
    if resp.status_code != 200:
        return {'error': 'Bitrix24 user.current error'}, 500
    data = resp.json().get('result', {})
    # Имя пользователя
    name = (data.get('NAME', '') + ' ' + data.get('LAST_NAME', '')).strip() or data.get('name', '')
    # Фото пользователя
    icon = data.get('PERSONAL_PHOTO', '') or data.get('PERSONAL_PHOTO_SRC', '') or data.get('PERSONAL_PHOTO_URL', '') or data.get('personalPhoto', '') or data.get('photo', '') or data.get('icon', '')
    if icon and icon.startswith('/'):
        from urllib.parse import urlparse
        parsed = urlparse(BITRIX_WEBHOOK)
        icon = f"{parsed.scheme}://{parsed.netloc}{icon}"
    
    # Получаем ID пользователя и URL для формирования ссылок на задачи
    from urllib.parse import urlparse
    parsed = urlparse(BITRIX_WEBHOOK)
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    
    user_id = data.get('ID', '')
    
    return {
        'name': name, 
        'icon': icon,
        'id': user_id,
        'baseUrl': base_url
    }


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=80)
