CC ?= cc
CFLAGS ?= -std=c11 -O2 -Wall -Wextra -Werror -pedantic
LDLIBS ?= -lsqlite3

.PHONY: all test clean
all: glorifier-memory

glorifier-memory: memory.c
	$(CC) $(CFLAGS) -o $@ $< $(LDLIBS)

test: glorifier-memory
	python3 -m unittest discover -s tests -p 'test_*.py' -v

clean:
	rm -f glorifier-memory
