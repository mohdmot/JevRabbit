from flask import Flask, request
import requests
import json
import os

app = Flask(__name__, static_folder='.', static_url_path='')

def jev_rabbit (rabbit_pos, env_sounds, view_feild_items, last_reaction):
    env_state = f"""
    You are a rabbit in a 2D environment. You are at position x:{rabbit_pos[0]}, y:{rabbit_pos[1]}.
    You can hear the following loudly audible sounds: {env_sounds}
    You can see the following items in your view field: {view_feild_items}
    Your last action was: {last_reaction}
    Move closely to the food items and avoid the sounds. Ran far away from the fox and knife.
    """
    response = requests.post(
    url="https://openrouter.ai/api/alpha/decisions",
    headers={
        "Authorization": "Bearer "+os.environ.get("OPENROUTER_KEY"),
        "Content-Type": "application/json",
    },
    data=json.dumps({
        "model": "~typesafe/jev-latest",
        "state": env_state,
        "questions": {
            "move": {
                "type": "choice",
                "instructions": "Where will you move?",
                "criteria": {
                    "+y": "go to +y direction",
                    "-y": "go to -y direction",
                    "-x": "go to -x direction",
                    "+x": "go to +x direction",
                    "none": "stay in place"
                }
            },
            "speed": {
                "type": "score",
                "instructions": "What speed will you move at?",
                "criteria": ["very slow", "slow", "medium", "fast", "very fast"]
            }
        }
    })
    )

    answers = response.json()["answers"]
    return {"goto": answers["move"]["choice"], "speed": answers["speed"]["score"]}


last_reaction = None

@app.route('/api/rabbit')
def get_reaction ():
    rabbit_pos = json.loads(request.args.get('rabbit_pos')) # [x,y]
    env_sounds = json.loads(request.args.get('env_sounds')) # [[x,y], ..]
    view_feild_items = json.loads(request.args.get('view_feild_items')) # [{"pos": [x,y], "distance": 2, "type": "grass"}, ..]
    global last_reaction

    last_reaction = jev_rabbit(rabbit_pos, env_sounds, view_feild_items, last_reaction)
    return last_reaction


@app.route('/')
def index():
    return app.send_static_file('index.html')

app.run()