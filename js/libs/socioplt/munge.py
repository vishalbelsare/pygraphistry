#transform socioplt's rank.html tables into out.json

import urllib2
from BeautifulSoup import BeautifulSoup
import json

page = open("rank.html")
#page = urllib2.urlopen("http://lmeyerov.github.io/projects/socioplt/viz/rank.html").read()

def tableToDict(table):
    return dict(
            [[tr.contents[3].text, #lang
                {"deviation": tr.contents[0].text,
                "rating": tr.contents[1].text,
                "ratingsMax": tr.contents[2].text,
                "ratingsMin": tr.contents[5].text,
                "volatility": tr.contents[6].text}] for tr in table.tbody.contents])

soup = BeautifulSoup(page)
soup.prettify()

statementTables = [table for table in soup.findAll('table') if table.thead]
statements = [table.tbody.tr.findAll('td')[4].text for table in statementTables]

deserializedTables = [tableToDict(table) for table in statementTables]
deserialized = dict(zip(statements, deserializedTables))

print json.dumps(deserialized)

with open('out.json', 'w') as outfile:
  json.dump(deserialized, outfile)