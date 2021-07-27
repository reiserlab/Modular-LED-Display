
.PHONY: docs localhost update


docs:
	@cd docs && $(MAKE)

localhost:
	@echo "Starting Jekyll, will try to open browser in 10 seconds"
	@( sleep 10 && xdg-open http://127.0.0.1:4000 &)
	@bundle exec jekyll serve 

update:
		@gem update
		@bundle update
