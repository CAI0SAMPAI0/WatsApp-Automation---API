Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "python client_agent.py", 0
Set WshShell = Nothing
