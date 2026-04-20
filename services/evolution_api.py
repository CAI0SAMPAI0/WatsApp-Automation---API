import os
import requests
from dotenv import load_dotenv

load_dotenv()

class EvolutionAPI:
    def __init__(self):
        self.__api_key = os.getenv('AUTHENTICATION_API_KEY')
        self.__headers = {
            'apikey': self.__api_key,
            'Content-Type': 'aplication/json'
        }

    def send_message(self, number, text):
        payload = {
            'number': number,
            'text': text,
        }
        response = requests.post(
            url=f'{self.BASE_URL}/message/sendText/{self.INSTANCE_NAME}',
            headers=self.__headers,
            json=payload,
        )
        return response.json()
    
