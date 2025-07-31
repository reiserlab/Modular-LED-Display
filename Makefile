
.PHONY: docs localhost update


docs:
	@cd docs && $(MAKE)

localhost:
	@bundle exec jekyll serve --livereload --host=0.0.0.0 --open-url

update-dependencies:
	@gem update
	@bundle update
