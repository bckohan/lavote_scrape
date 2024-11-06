from typer import Typer, Argument, Option
import typing as t
import requests
import time
from glob import glob
from dateutil.parser import parse
import json
from pathlib import Path
import vlc
from datetime import datetime


app = Typer()

FILE_NAME = "{eid}_{date}.json"
moo_mp3 = Path(__file__).parent.parent / "moo.mp3"
assert moo_mp3.exists()


@app.command()
def scrape(
    eid: t.Annotated[int, Argument(help="Election ID")],
    delay: t.Annotated[int, Option(help="Delay in seconds")] = 60,
):
    player = vlc.MediaPlayer(moo_mp3)
    #player.play()
    last_timestamp = None
    result_files = glob(f"{eid}_*.json")
    if result_files:
        last_file = sorted(result_files)[-1]
        last_timestamp = parse(last_file.split("_")[1].split(".")[0])
    
    while True:
        results = requests.get(
            f"https://results.lavote.gov/ElectionResults/GetCounterData?electionID={eid}"
        ).json()
        timestamp = parse(results["TimeStamp"])

        if not last_timestamp or timestamp > last_timestamp:
            timestamp = datetime.now()
            filename = FILE_NAME.format(eid=eid, date=str(timestamp))
            with open(filename, "w") as f:
                json.dump(results, f)
            last_timestamp = timestamp
            vlc.MediaPlayer(moo_mp3).play()
            print(f"New Results {filename}")

        print("Sleeping...")
        time.sleep(delay)


def main():
    app()

if __name__ == "__main__":
    main()
